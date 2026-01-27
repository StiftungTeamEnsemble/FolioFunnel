"use server";

import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import { DEFAULT_CHAT_MODEL, isValidChatModel } from "@/lib/models";
import { renderPromptTemplate } from "@/lib/prompts";
import { countPromptTokens, estimatePromptCost } from "@/lib/prompt-cost";
import { enqueuePromptRun } from "@/lib/queue";
import { RunType, RunStatus } from "@prisma/client";

interface CountPromptTokensInput {
  prompt: string;
  model: string;
}

export async function countPromptTokensAction({
  prompt,
  model,
}: CountPromptTokensInput) {
  if (!prompt.trim()) {
    return { error: "Prompt is empty." };
  }

  const validatedModel = isValidChatModel(model) ? model : DEFAULT_CHAT_MODEL;
  const tokenCount = countPromptTokens(prompt, validatedModel);
  const costEstimate = estimatePromptCost(tokenCount, validatedModel);

  return { tokenCount, costEstimate };
}

interface CreatePromptRunInput {
  projectId: string;
  documentIds: string[];
  promptTemplate: string;
  model: string;
  filters: unknown;
}

export async function createPromptRunAction({
  projectId,
  documentIds,
  promptTemplate,
  model,
  filters,
}: CreatePromptRunInput) {
  if (!promptTemplate.trim()) {
    return { error: "Prompt template is required." };
  }

  if (!documentIds.length) {
    return { error: "Select at least one document." };
  }

  const { user } = await requireProjectAccess(projectId);
  const validatedModel = isValidChatModel(model) ? model : DEFAULT_CHAT_MODEL;

  const documents = await prisma.document.findMany({
    where: {
      projectId,
      id: { in: documentIds },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!documents.length) {
    return { error: "No documents matched the selection." };
  }

  const promptContext = {
    documents: documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      sourceType: doc.sourceType,
      sourceUrl: doc.sourceUrl,
      createdAt: doc.createdAt.toISOString(),
      ...(doc.values as Record<string, unknown>),
    })),
    documentCount: documents.length,
  };

  let renderedPrompt: string;
  try {
    renderedPrompt = renderPromptTemplate(promptTemplate, promptContext);
  } catch (error) {
    return { error: "Prompt template could not be rendered." };
  }

  if (!renderedPrompt.trim()) {
    return { error: "Rendered prompt is empty." };
  }

  const run = await prisma.run.create({
    data: {
      projectId,
      createdById: user.id,
      type: RunType.prompt,
      status: RunStatus.queued,
      model: validatedModel,
      promptTemplate,
      renderedPrompt,
      config: { filters, documentIds },
      // tokenCount and costEstimate will be set after AI response
    },
  });
  try {
    await enqueuePromptRun({ promptRunId: run.id });
  } catch (error) {
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: RunStatus.error,
        error:
          error instanceof Error ? error.message : "Failed to queue prompt.",
      },
    });

    return { error: "Prompt failed to queue.", promptRunId: run.id };
  }

  return { promptRunId: run.id };
}

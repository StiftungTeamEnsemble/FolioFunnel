"use server";

import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import { DEFAULT_CHAT_MODEL, isValidChatModel } from "@/lib/models";
import { renderPromptTemplate } from "@/lib/prompts";
import { countPromptTokens, estimatePromptCost } from "@/lib/prompt-cost";
import { enqueuePromptRun } from "@/lib/queue";
import { RunType, RunStatus } from "@prisma/client";
import { getFilteredDocumentIds } from "@/lib/document-filters";
import type { FilterGroup } from "@/lib/document-filters";

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
  promptTemplateId: string;
  model: string;
}

export async function createPromptRunAction({
  projectId,
  promptTemplateId,
  model,
}: CreatePromptRunInput) {
  const { user } = await requireProjectAccess(projectId);
  const validatedModel = isValidChatModel(model) ? model : DEFAULT_CHAT_MODEL;

  const promptTemplateRecord = await prisma.promptTemplate.findFirst({
    where: { id: promptTemplateId, projectId },
  });

  if (!promptTemplateRecord) {
    return { error: "Prompt template not found." };
  }

  const filters = (promptTemplateRecord.filters as FilterGroup[]) || [];
  const documentIds = await getFilteredDocumentIds(projectId, filters);

  if (!documentIds.length) {
    return { error: "No documents matched the selection." };
  }

  const documents = await prisma.document.findMany({
    where: {
      projectId,
      id: { in: documentIds },
    },
    orderBy: { createdAt: "desc" },
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!documents.length || !project) {
    return { error: "No documents matched the selection." };
  }

  const promptContext = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
    },
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
    renderedPrompt = renderPromptTemplate(
      promptTemplateRecord.promptTemplate,
      promptContext,
    );
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
      promptTemplate: promptTemplateRecord.promptTemplate,
      renderedPrompt,
      config: {
        filters,
        documentIds,
        promptTemplateId: promptTemplateRecord.id,
        promptTemplateTitle: promptTemplateRecord.title,
      },
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

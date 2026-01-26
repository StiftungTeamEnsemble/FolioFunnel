"use server";

import OpenAI from "openai";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import { DEFAULT_CHAT_MODEL, isValidChatModel } from "@/lib/models";
import { renderPromptTemplate } from "@/lib/prompts";
import { countPromptTokens, estimatePromptCost } from "@/lib/prompt-cost";

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

  const tokenCount = countPromptTokens(renderedPrompt, validatedModel);
  const costEstimate = estimatePromptCost(tokenCount, validatedModel);

  const run = await prisma.promptRun.create({
    data: {
      projectId,
      createdById: user.id,
      model: validatedModel,
      promptTemplate,
      renderedPrompt,
      filters,
      documentIds,
      tokenCount,
      costEstimate,
      status: "running",
    },
  });

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    await prisma.promptRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        error: "OpenAI API key not configured.",
      },
    });
    return { error: "OpenAI API key not configured.", promptRunId: run.id };
  }

  try {
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const response = await openai.chat.completions.create({
      model: validatedModel,
      messages: [{ role: "user", content: renderedPrompt }],
    });

    const result = response.choices[0]?.message?.content || "";

    await prisma.promptRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        result,
      },
    });
  } catch (error) {
    await prisma.promptRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        error: error instanceof Error ? error.message : "Prompt failed.",
      },
    });

    return { error: "Prompt failed to run.", promptRunId: run.id };
  }

  return { promptRunId: run.id };
}

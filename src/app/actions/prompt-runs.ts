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

interface EstimatePromptCostInput {
  projectId: string;
  promptTemplateId: string;
  model: string;
}

const normalizeTags = (tags: string[]) =>
  Array.from(
    new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
  );

export async function estimatePromptCostAction({
  projectId,
  promptTemplateId,
  model,
}: EstimatePromptCostInput) {
  await requireProjectAccess(projectId);

  const validatedModel = isValidChatModel(model) ? model : DEFAULT_CHAT_MODEL;
  const promptTemplateRecord = await prisma.promptTemplate.findFirst({
    where: { id: promptTemplateId, projectId },
  });

  if (!promptTemplateRecord) {
    return { error: "Prompt template not found." };
  }

  const filters =
    (promptTemplateRecord.filters as unknown as FilterGroup[]) || [];
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

  const tokenCount = countPromptTokens(renderedPrompt, validatedModel);
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

  const filters =
    (promptTemplateRecord.filters as unknown as FilterGroup[]) || [];
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
      } as any,
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

interface SoftDeletePromptRunInput {
  projectId: string;
  promptRunId: string;
}

export async function softDeletePromptRunAction({
  projectId,
  promptRunId,
}: SoftDeletePromptRunInput) {
  await requireProjectAccess(projectId);

  const run = await prisma.run.findFirst({
    where: {
      id: promptRunId,
      projectId,
      type: RunType.prompt,
    },
  });

  if (!run) {
    return { error: "Prompt run not found." };
  }

  const meta =
    run.meta && typeof run.meta === "object"
      ? (run.meta as Record<string, unknown>)
      : {};

  await prisma.run.update({
    where: { id: promptRunId },
    data: {
      meta: {
        ...meta,
        hiddenAt: new Date().toISOString(),
      },
    },
  });

  return { success: true };
}

interface UpdatePromptRunTagsInput {
  projectId: string;
  promptRunId: string;
  tags: string[];
}

export async function updatePromptRunTagsAction({
  projectId,
  promptRunId,
  tags,
}: UpdatePromptRunTagsInput) {
  await requireProjectAccess(projectId);

  const run = await prisma.run.findFirst({
    where: {
      id: promptRunId,
      projectId,
      type: RunType.prompt,
    },
  });

  if (!run) {
    return { error: "Prompt run not found." };
  }

  const normalizedTags = normalizeTags(tags);

  await prisma.run.update({
    where: { id: promptRunId },
    data: { tags: normalizedTags },
  });

  return { success: true, tags: normalizedTags };
}

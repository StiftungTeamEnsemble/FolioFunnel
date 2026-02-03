"use server";

import prisma from "@/lib/db";
import { requireProjectAccess, requireAuth } from "@/lib/session";
import { enqueueBulkProcess, getBoss } from "@/lib/queue";
import { createProcessorRun, expandTemplate } from "@/lib/processors";
import { RunStatus, RunType } from "@prisma/client";
import {
  getFilteredDocumentIds,
  type FilterGroup,
} from "@/lib/document-filters";
import { DEFAULT_CHAT_MODEL, isValidChatModel } from "@/lib/models";
import { countPromptTokens, estimatePromptCost } from "@/lib/prompt-cost";

const DEFAULT_PROCESSOR_SYSTEM_PROMPT =
  "You are a helpful assistant that processes documents.";

export async function clearPendingTasks() {
  const user = await requireAuth();

  try {
    // Delete all queued/running runs (both processor and prompt) for projects the user has access to
    const result = await prisma.run.deleteMany({
      where: {
        status: { in: [RunStatus.queued, RunStatus.running] },
        project: {
          memberships: {
            some: {
              userId: user.id,
            },
          },
        },
      },
    });

    // Note: Orphaned pg-boss jobs will be handled gracefully by the worker
    // via P2025 error handling - they will be skipped when the Run record is not found

    return {
      success: true,
      deletedCount: result.count,
    };
  } catch (error) {
    console.error("Clear pending tasks error:", error);
    return { error: "Failed to clear pending tasks" };
  }
}

export async function triggerProcessorRun(
  projectId: string,
  documentId: string,
  columnId: string,
) {
  await requireProjectAccess(projectId);

  try {
    // Verify document and column exist
    const [document, column] = await Promise.all([
      prisma.document.findFirst({ where: { id: documentId, projectId } }),
      prisma.column.findFirst({ where: { id: columnId, projectId } }),
    ]);

    if (!document) {
      return { error: "Document not found" };
    }

    if (!column) {
      return { error: "Column not found" };
    }

    if (column.mode !== "processor") {
      return { error: "Column is not a processor column" };
    }

    // Check for already running/queued job
    const existingRun = await prisma.run.findFirst({
      where: {
        type: RunType.processor,
        documentId,
        columnId,
        status: { in: [RunStatus.queued, RunStatus.running] },
      },
    });

    if (existingRun) {
      return { error: "A job is already running or queued for this cell" };
    }

    // Create run and enqueue job (createProcessorRun handles both)
    console.log(
      "[Action] Creating processor run for document",
      documentId,
      "column",
      columnId,
    );
    const runId = await createProcessorRun(projectId, documentId, columnId);
    console.log("[Action] Processor run created and job enqueued:", runId);

    return { success: true, runId };
  } catch (error) {
    console.error("Trigger processor run error:", error);
    return { error: "Failed to trigger processor run" };
  }
}

export async function triggerBulkProcessorRun(
  projectId: string,
  columnId: string,
  filters: FilterGroup[] = [],
) {
  await requireProjectAccess(projectId);

  try {
    const column = await prisma.column.findFirst({
      where: { id: columnId, projectId },
    });

    if (!column) {
      return { error: "Column not found" };
    }

    if (column.mode !== "processor") {
      return { error: "Column is not a processor column" };
    }

    const documentIds = await getFilteredDocumentIds(projectId, filters);

    // Enqueue bulk job
    await enqueueBulkProcess({ projectId, columnId, documentIds });

    return { success: true };
  } catch (error) {
    console.error("Trigger bulk processor run error:", error);
    return { error: "Failed to trigger bulk processor run" };
  }
}

export async function estimateBulkProcessorCostAction({
  projectId,
  columnId,
  filters = [],
}: {
  projectId: string;
  columnId: string;
  filters?: FilterGroup[];
}) {
  const getProcessorConfig = (column: {
    processorType: string | null;
    processorConfig: unknown;
  }) => {
    if (column.processorType !== "ai_transform") {
      return { error: "Cost estimates are only available for AI processors." };
    }

    const config = (column.processorConfig as Record<string, unknown>) || {};
    const promptTemplate =
      typeof config.promptTemplate === "string" ? config.promptTemplate : "";

    if (!promptTemplate.trim()) {
      return { error: "Processor prompt template is empty." };
    }

    const requestedModel =
      typeof config.model === "string" ? config.model : DEFAULT_CHAT_MODEL;
    const validatedModel = isValidChatModel(requestedModel)
      ? requestedModel
      : DEFAULT_CHAT_MODEL;
    const systemPrompt =
      typeof config.systemPrompt === "string" && config.systemPrompt.trim()
        ? config.systemPrompt
        : DEFAULT_PROCESSOR_SYSTEM_PROMPT;

    return { promptTemplate, validatedModel, systemPrompt };
  };

  await requireProjectAccess(projectId);

  const column = await prisma.column.findFirst({
    where: { id: columnId, projectId },
  });

  if (!column) {
    return { error: "Column not found" };
  }

  if (column.mode !== "processor") {
    return { error: "Column is not a processor column" };
  }

  const configResult = getProcessorConfig(column);
  if ("error" in configResult) {
    return { error: configResult.error };
  }

  const { promptTemplate, validatedModel, systemPrompt } = configResult;

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

  if (!documents.length) {
    return { error: "No documents matched the selection." };
  }

  let totalTokens = 0;

  try {
    for (const doc of documents) {
      const values = (doc.values as Record<string, unknown>) || {};
      const documentContext: Record<string, unknown> = {
        id: doc.id,
        title: doc.title,
        sourceType: doc.sourceType,
        sourceUrl: doc.sourceUrl,
        ...values,
      };
      const contextValues: Record<string, unknown> = {
        document: documentContext,
        ...documentContext,
      };

      const userPrompt = expandTemplate(promptTemplate, contextValues);

      if (!userPrompt.trim()) {
        return { error: "Rendered prompt is empty." };
      }

      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
      totalTokens += countPromptTokens(combinedPrompt, validatedModel);
    }
  } catch (error) {
    return { error: "Prompt template could not be rendered." };
  }

  const costEstimate = estimatePromptCost(totalTokens, validatedModel);

  return { tokenCount: totalTokens, costEstimate };
}

export async function prepareBulkProcessorCostEstimate({
  projectId,
  columnId,
  filters = [],
}: {
  projectId: string;
  columnId: string;
  filters?: FilterGroup[];
}) {
  await requireProjectAccess(projectId);

  const column = await prisma.column.findFirst({
    where: { id: columnId, projectId },
  });

  if (!column) {
    return { error: "Column not found" };
  }

  if (column.mode !== "processor") {
    return { error: "Column is not a processor column" };
  }

  if (column.processorType !== "ai_transform") {
    return { error: "Cost estimates are only available for AI processors." };
  }

  const config = (column.processorConfig as Record<string, unknown>) || {};
  const promptTemplate =
    typeof config.promptTemplate === "string" ? config.promptTemplate : "";

  if (!promptTemplate.trim()) {
    return { error: "Processor prompt template is empty." };
  }

  const documentIds = await getFilteredDocumentIds(projectId, filters);

  if (!documentIds.length) {
    return { error: "No documents matched the selection." };
  }

  return { documentIds, totalDocuments: documentIds.length };
}

export async function estimateBulkProcessorCostBatchAction({
  projectId,
  columnId,
  documentIds,
}: {
  projectId: string;
  columnId: string;
  documentIds: string[];
}) {
  await requireProjectAccess(projectId);

  if (!documentIds.length) {
    return { tokenCount: 0, costEstimate: 0 };
  }

  const column = await prisma.column.findFirst({
    where: { id: columnId, projectId },
  });

  if (!column) {
    return { error: "Column not found" };
  }

  if (column.mode !== "processor") {
    return { error: "Column is not a processor column" };
  }

  if (column.processorType !== "ai_transform") {
    return { error: "Cost estimates are only available for AI processors." };
  }

  const config = (column.processorConfig as Record<string, unknown>) || {};
  const promptTemplate =
    typeof config.promptTemplate === "string" ? config.promptTemplate : "";

  if (!promptTemplate.trim()) {
    return { error: "Processor prompt template is empty." };
  }

  const requestedModel =
    typeof config.model === "string" ? config.model : DEFAULT_CHAT_MODEL;
  const validatedModel = isValidChatModel(requestedModel)
    ? requestedModel
    : DEFAULT_CHAT_MODEL;
  const systemPrompt =
    typeof config.systemPrompt === "string" && config.systemPrompt.trim()
      ? config.systemPrompt
      : DEFAULT_PROCESSOR_SYSTEM_PROMPT;

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

  let totalTokens = 0;

  try {
    for (const doc of documents) {
      const values = (doc.values as Record<string, unknown>) || {};
      const documentContext: Record<string, unknown> = {
        id: doc.id,
        title: doc.title,
        sourceType: doc.sourceType,
        sourceUrl: doc.sourceUrl,
        ...values,
      };
      const contextValues: Record<string, unknown> = {
        document: documentContext,
        ...documentContext,
      };

      const userPrompt = expandTemplate(promptTemplate, contextValues);

      if (!userPrompt.trim()) {
        return { error: "Rendered prompt is empty." };
      }

      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
      totalTokens += countPromptTokens(combinedPrompt, validatedModel);
    }
  } catch (error) {
    return { error: "Prompt template could not be rendered." };
  }

  const costEstimate = estimatePromptCost(totalTokens, validatedModel);

  return { tokenCount: totalTokens, costEstimate };
}

export async function getProcessorRuns(
  projectId: string,
  options?: {
    documentId?: string;
    columnId?: string;
    limit?: number;
  },
) {
  await requireProjectAccess(projectId);

  const runs = await prisma.run.findMany({
    where: {
      projectId,
      type: RunType.processor,
      ...(options?.documentId && { documentId: options.documentId }),
      ...(options?.columnId && { columnId: options.columnId }),
    },
    include: {
      column: {
        select: { key: true, name: true },
      },
      document: {
        select: { title: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit || 50,
  });

  return runs;
}

export async function getLatestRunsForDocument(
  projectId: string,
  documentId: string,
) {
  await requireProjectAccess(projectId);

  // Get the latest run for each column for this document
  const runs = await prisma.$queryRaw<
    Array<{
      columnId: string;
      columnKey: string;
      status: RunStatus;
      error: string | null;
      finishedAt: Date | null;
    }>
  >`
    SELECT DISTINCT ON (r.column_id)
      r.column_id as "columnId",
      c.key as "columnKey",
      r.status::text as status,
      r.error,
      r.finished_at as "finishedAt"
    FROM runs r
    JOIN columns c ON c.id = r.column_id
    WHERE r.project_id = ${projectId}::uuid
      AND r.document_id = ${documentId}::uuid
      AND r.type = 'processor'
    ORDER BY r.column_id, r.created_at DESC
  `;

  return runs;
}

export async function getRunStatus(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      column: {
        select: { key: true, name: true },
      },
    },
  });

  return run;
}

export async function redownloadUrl(projectId: string, documentId: string) {
  await requireProjectAccess(projectId);

  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      return { error: "Document not found" };
    }

    if (document.sourceType !== "url") {
      return { error: "Document is not a URL" };
    }

    // Find or create url_to_html column
    let htmlColumn = await prisma.column.findFirst({
      where: {
        projectId,
        processorType: "url_to_html",
      },
    });

    if (!htmlColumn) {
      htmlColumn = await prisma.column.create({
        data: {
          projectId,
          key: "html_source",
          name: "HTML Source",
          mode: "processor",
          processorType: "url_to_html",
          hidden: true,
        },
      });
    }

    // Create and enqueue processor run
    const runId = await createProcessorRun(
      projectId,
      documentId,
      htmlColumn.id,
    );

    return { success: true, runId };
  } catch (error) {
    console.error("Re-download URL error:", error);
    return { error: "Failed to re-download URL" };
  }
}

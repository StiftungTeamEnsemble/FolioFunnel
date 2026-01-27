"use server";

import prisma from "@/lib/db";
import { requireProjectAccess, requireAuth } from "@/lib/session";
import { enqueueBulkProcess } from "@/lib/queue";
import { createProcessorRun } from "@/lib/processors";
import { RunStatus, RunType } from "@prisma/client";

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

    // Enqueue bulk job
    await enqueueBulkProcess({ projectId, columnId });

    return { success: true };
  } catch (error) {
    console.error("Trigger bulk processor run error:", error);
    return { error: "Failed to trigger bulk processor run" };
  }
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

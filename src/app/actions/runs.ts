'use server';

import prisma from '@/lib/db';
import { requireProjectAccess } from '@/lib/session';
import { enqueueProcessDocument, enqueueBulkProcess } from '@/lib/queue';
import { createProcessorRun } from '@/lib/processors';
import { RunStatus } from '@prisma/client';

export async function triggerProcessorRun(
  projectId: string,
  documentId: string,
  columnId: string
) {
  await requireProjectAccess(projectId);
  
  try {
    // Verify document and column exist
    const [document, column] = await Promise.all([
      prisma.document.findFirst({ where: { id: documentId, projectId } }),
      prisma.column.findFirst({ where: { id: columnId, projectId } }),
    ]);
    
    if (!document) {
      return { error: 'Document not found' };
    }
    
    if (!column) {
      return { error: 'Column not found' };
    }
    
    if (column.mode !== 'processor') {
      return { error: 'Column is not a processor column' };
    }
    
    // Check for already running/queued job
    const existingRun = await prisma.processorRun.findFirst({
      where: {
        documentId,
        columnId,
        status: { in: [RunStatus.queued, RunStatus.running] },
      },
    });
    
    if (existingRun) {
      return { error: 'A job is already running or queued for this cell' };
    }
    
    // Create run and enqueue job
    const runId = await createProcessorRun(projectId, documentId, columnId);
    await enqueueProcessDocument({
      projectId,
      documentId,
      columnId,
      runId,
    });
    
    return { success: true, runId };
  } catch (error) {
    console.error('Trigger processor run error:', error);
    return { error: 'Failed to trigger processor run' };
  }
}

export async function triggerBulkProcessorRun(projectId: string, columnId: string) {
  await requireProjectAccess(projectId);
  
  try {
    const column = await prisma.column.findFirst({
      where: { id: columnId, projectId },
    });
    
    if (!column) {
      return { error: 'Column not found' };
    }
    
    if (column.mode !== 'processor') {
      return { error: 'Column is not a processor column' };
    }
    
    // Enqueue bulk job
    await enqueueBulkProcess({ projectId, columnId });
    
    return { success: true };
  } catch (error) {
    console.error('Trigger bulk processor run error:', error);
    return { error: 'Failed to trigger bulk processor run' };
  }
}

export async function getProcessorRuns(projectId: string, options?: {
  documentId?: string;
  columnId?: string;
  limit?: number;
}) {
  await requireProjectAccess(projectId);
  
  const runs = await prisma.processorRun.findMany({
    where: {
      projectId,
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
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
  });
  
  return runs;
}

export async function getLatestRunsForDocument(projectId: string, documentId: string) {
  await requireProjectAccess(projectId);
  
  // Get the latest run for each column for this document
  const runs = await prisma.$queryRaw<Array<{
    columnId: string;
    columnKey: string;
    status: RunStatus;
    error: string | null;
    finishedAt: Date | null;
  }>>`
    SELECT DISTINCT ON (pr.column_id)
      pr.column_id as "columnId",
      c.key as "columnKey",
      pr.status,
      pr.error,
      pr.finished_at as "finishedAt"
    FROM processor_runs pr
    JOIN columns c ON c.id = pr.column_id
    WHERE pr.project_id = ${projectId}::uuid
      AND pr.document_id = ${documentId}::uuid
    ORDER BY pr.column_id, pr.created_at DESC
  `;
  
  return runs;
}

export async function getRunStatus(runId: string) {
  const run = await prisma.processorRun.findUnique({
    where: { id: runId },
    include: {
      column: {
        select: { key: true, name: true },
      },
    },
  });
  
  return run;
}

export async function clearPendingTasks() {
  try {
    // Delete all queued and running tasks
    const result = await prisma.processorRun.deleteMany({
      where: {
        status: { in: [RunStatus.queued, RunStatus.running] },
      },
    });
    
    return { success: true, count: result.count };
  } catch (error) {
    console.error('Clear pending tasks error:', error);
    return { error: 'Failed to clear pending tasks' };
  }
}

import PgBoss from "pg-boss";

const connectionString = process.env.DATABASE_URL!;

const globalForBoss = globalThis as unknown as {
  boss: PgBoss | undefined;
  bossStarted: boolean | undefined;
};

export function getBoss(): PgBoss {
  if (!globalForBoss.boss) {
    globalForBoss.boss = new PgBoss({
      connectionString,
      retryLimit: 3,
      retryDelay: 5,
      retentionDays: 7,
    });
  }
  return globalForBoss.boss;
}

// Start boss and create queues if not already done
async function ensureBossReady(): Promise<PgBoss> {
  const boss = getBoss();
  if (!globalForBoss.bossStarted) {
    await boss.start();
    // Create queues
    await boss.createQueue(QUEUE_NAMES.PROCESS_JOB);
    await boss.createQueue(QUEUE_NAMES.BULK_PROCESS);
    globalForBoss.bossStarted = true;
  }
  return boss;
}

// Job queue names - unified into a single processing queue
export const QUEUE_NAMES = {
  PROCESS_JOB: "process-job", // Unified queue for all processing jobs
  BULK_PROCESS: "bulk-process", // Orchestration queue for bulk operations
} as const;

// ============================================================================
// Unified Job Types - discriminated union for different processing modes
// ============================================================================

// Column processor job - processes a document with a column's processor config
export interface ColumnProcessorJob {
  type: "column_processor";
  projectId: string;
  documentId: string;
  columnId: string;
  runId: string;
}

// Prompt run job - executes a prompt run with its configuration
export interface PromptRunJob {
  type: "prompt_run";
  promptRunId: string;
}

// Union type for all job types
export type ProcessJobData = ColumnProcessorJob | PromptRunJob;

// Bulk process job data (unchanged)
export interface BulkProcessJobData {
  projectId: string;
  columnId: string;
  documentIds?: string[];
}

// ============================================================================
// Queue Functions
// ============================================================================

/**
 * Enqueue a unified processing job (column processor or prompt run)
 */
export async function enqueueProcessJob(data: ProcessJobData) {
  console.log("[Queue] Enqueueing process-job:", data);
  try {
    const boss = await ensureBossReady();
    const id = await boss.send(QUEUE_NAMES.PROCESS_JOB, data, {
      expireInMinutes: 60,
    });
    console.log("[Queue] Job enqueued with id", id);
    return id;
  } catch (error) {
    console.error("[Queue] Error enqueueing job:", error);
    throw error;
  }
}

/**
 * Convenience function to enqueue a column processor job
 */
export async function enqueueColumnProcessor(
  data: Omit<ColumnProcessorJob, "type">,
) {
  return enqueueProcessJob({ type: "column_processor", ...data });
}

/**
 * Convenience function to enqueue a prompt run job
 */
export async function enqueuePromptRun(data: { promptRunId: string }) {
  return enqueueProcessJob({ type: "prompt_run", ...data });
}

/**
 * Enqueue a bulk process job (orchestration)
 */
export async function enqueueBulkProcess(data: BulkProcessJobData) {
  console.log("[Queue] Enqueueing bulk-process job:", data);
  try {
    const boss = await ensureBossReady();
    const id = await boss.send(QUEUE_NAMES.BULK_PROCESS, data, {
      retryLimit: 1,
      retryDelay: 30,
      expireInMinutes: 60,
    });
    console.log("[Queue] Bulk job enqueued with id", id);
    return id;
  } catch (error) {
    console.error("[Queue] Error enqueueing bulk job:", error);
    throw error;
  }
}

// ============================================================================
// Legacy exports for backwards compatibility (deprecated - use unified queue)
// ============================================================================

/** @deprecated Use enqueueColumnProcessor instead */
export interface ProcessDocumentJobData {
  projectId: string;
  documentId: string;
  columnId: string;
  runId: string;
}

/** @deprecated Use enqueueColumnProcessor instead */
export async function enqueueProcessDocument(data: ProcessDocumentJobData) {
  return enqueueColumnProcessor(data);
}

/** @deprecated Use enqueuePromptRun instead */
export interface PromptRunJobData {
  promptRunId: string;
}

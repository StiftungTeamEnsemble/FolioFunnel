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
    await boss.createQueue(QUEUE_NAMES.PROCESS_DOCUMENT);
    await boss.createQueue(QUEUE_NAMES.BULK_PROCESS);
    await boss.createQueue(QUEUE_NAMES.PROMPT_RUN);
    globalForBoss.bossStarted = true;
  }
  return boss;
}

// Job queue names
export const QUEUE_NAMES = {
  PROCESS_DOCUMENT: "process-document",
  PROCESS_COLUMN: "process-column",
  BULK_PROCESS: "bulk-process",
  PROMPT_RUN: "prompt-run",
} as const;

// Job data types
export interface ProcessDocumentJobData {
  projectId: string;
  documentId: string;
  columnId: string;
  runId: string;
}

export interface BulkProcessJobData {
  projectId: string;
  columnId: string;
}

export interface PromptRunJobData {
  promptRunId: string;
}

export async function enqueueProcessDocument(data: ProcessDocumentJobData) {
  console.log("[Queue] Enqueueing process-document job:", data);
  try {
    const boss = await ensureBossReady();
    const id = await boss.send(QUEUE_NAMES.PROCESS_DOCUMENT, data, {
      expireInMinutes: 60,
    });
    console.log("[Queue] Job enqueued with id", id);
    return id;
  } catch (error) {
    console.error("[Queue] Error enqueueing job:", error);
    throw error;
  }
}

export async function enqueueBulkProcess(data: BulkProcessJobData) {
  console.log("[Queue] Enqueueing bulk-process job:", data);
  try {
    const boss = await ensureBossReady();
    const id = await boss.send(QUEUE_NAMES.BULK_PROCESS, data, {
      expireInMinutes: 60,
    });
    console.log("[Queue] Bulk job enqueued with id", id);
    return id;
  } catch (error) {
    console.error("[Queue] Error enqueueing bulk job:", error);
    throw error;
  }
}

export async function enqueuePromptRun(data: PromptRunJobData) {
  console.log("[Queue] Enqueueing prompt-run job:", data);
  try {
    const boss = await ensureBossReady();
    const id = await boss.send(QUEUE_NAMES.PROMPT_RUN, data, {
      expireInMinutes: 60,
    });
    console.log("[Queue] Prompt job enqueued with id", id);
    return id;
  } catch (error) {
    console.error("[Queue] Error enqueueing prompt job:", error);
    throw error;
  }
}

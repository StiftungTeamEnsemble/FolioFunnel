import PgBoss from 'pg-boss';

const connectionString = process.env.DATABASE_URL!;

const globalForBoss = globalThis as unknown as {
  boss: PgBoss | undefined;
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

// Job queue names
export const QUEUE_NAMES = {
  PROCESS_DOCUMENT: 'process-document',
  PROCESS_COLUMN: 'process-column',
  BULK_PROCESS: 'bulk-process',
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

// Track if boss has been started for sending
const bossStarted = { value: false };

async function ensureBossStarted(): Promise<PgBoss> {
  const boss = getBoss();
  if (!bossStarted.value) {
    await boss.start();
    bossStarted.value = true;
  }
  return boss;
}

// Enqueue functions
export async function enqueueProcessDocument(data: ProcessDocumentJobData) {
  const boss = await ensureBossStarted();
  await boss.send(QUEUE_NAMES.PROCESS_DOCUMENT, data, {
    retryLimit: 2,
    retryDelay: 10,
  });
}

export async function enqueueBulkProcess(data: BulkProcessJobData) {
  const boss = await ensureBossStarted();
  await boss.send(QUEUE_NAMES.BULK_PROCESS, data, {
    retryLimit: 1,
    retryDelay: 30,
  });
}

import PgBoss from 'pg-boss';
import prisma from '@/lib/db';

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

// Enqueue functions - use raw SQL to insert directly into pgboss.job table
// This avoids the need to start pg-boss in the Next.js app
export async function enqueueProcessDocument(data: ProcessDocumentJobData) {
  console.log('[Queue] Enqueueing process-document job:', data);
  try {
    const result = await prisma.$executeRaw`
      INSERT INTO pgboss.job (name, data, state, retry_limit, retry_delay, expire_in)
      VALUES (
        ${QUEUE_NAMES.PROCESS_DOCUMENT},
        ${JSON.stringify(data)}::jsonb,
        'created',
        2,
        10,
        interval '1 hour'
      )
    `;
    console.log('[Queue] Job inserted into pgboss.job');
    return result;
  } catch (error) {
    console.error('[Queue] Error enqueueing job:', error);
    throw error;
  }
}

export async function enqueueBulkProcess(data: BulkProcessJobData) {
  console.log('[Queue] Enqueueing bulk-process job:', data);
  try {
    const result = await prisma.$executeRaw`
      INSERT INTO pgboss.job (name, data, state, retry_limit, retry_delay, expire_in)
      VALUES (
        ${QUEUE_NAMES.BULK_PROCESS},
        ${JSON.stringify(data)}::jsonb,
        'created',
        1,
        30,
        interval '1 hour'
      )
    `;
    console.log('[Queue] Job inserted into pgboss.job');
    return result;
  } catch (error) {
    console.error('[Queue] Error enqueueing job:', error);
    throw error;
  }
}

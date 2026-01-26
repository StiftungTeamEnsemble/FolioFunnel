import { getBoss, QUEUE_NAMES, ProcessDocumentJobData, BulkProcessJobData } from '@/lib/queue';
import { runProcessor, createProcessorRun, getProcessorColumns } from '@/lib/processors';
import prisma from '@/lib/db';

// pg-boss v10 passes an array of jobs to the handler
type PgBossJob<T> = { id: string; name: string; data: T };

async function handleProcessDocument(jobs: PgBossJob<ProcessDocumentJobData>[]) {
  console.log(`[Worker] handleProcessDocument called with ${jobs.length} job(s)`);
  
  for (const job of jobs) {
    const { projectId, documentId, columnId, runId } = job.data;
    
    console.log(`[Worker] Processing document ${documentId} for column ${columnId}`);
    
    try {
      const [document, column] = await Promise.all([
        prisma.document.findUnique({ where: { id: documentId } }),
        prisma.column.findUnique({ where: { id: columnId } }),
      ]);
      
      if (!document || !column) {
        console.error('[Worker] Document or column not found');
        continue;
      }
      
      await runProcessor({
        document,
        column,
        runId,
        projectId,
      });
      
      console.log(`[Worker] Completed processing document ${documentId} for column ${columnId}`);
    } catch (error) {
      console.error('[Worker] Error processing document:', error);
      throw error;
    }
  }
}

async function handleBulkProcess(jobs: PgBossJob<BulkProcessJobData>[]) {
  console.log(`[Worker] handleBulkProcess called with ${jobs.length} job(s)`);
  
  for (const job of jobs) {
    const { projectId, columnId } = job.data;
    
    console.log(`[Worker] Starting bulk process for column ${columnId} in project ${projectId}`);
    
    try {
      const column = await prisma.column.findUnique({ where: { id: columnId } });
      if (!column) {
        console.error('[Worker] Column not found');
        continue;
      }
      
      const documents = await prisma.document.findMany({
        where: { projectId },
      });
      
      const boss = getBoss();
      
      // Enqueue jobs for each document with rate limiting
      for (const document of documents) {
        const runId = await createProcessorRun(projectId, document.id, columnId);
        
        await boss.send(
          QUEUE_NAMES.PROCESS_DOCUMENT,
          {
            projectId,
            documentId: document.id,
            columnId,
            runId,
          },
          {
            retryLimit: 2,
            retryDelay: 10,
          }
        );
      }
      
      console.log(`[Worker] Enqueued ${documents.length} jobs for bulk process`);
    } catch (error) {
      console.error('[Worker] Error in bulk process:', error);
      throw error;
    }
  }
}

export async function startWorker() {
  console.log('Starting worker...');
  
  const boss = getBoss();
  await boss.start();
  
  console.log('pg-boss started');
  
  // Create queues (required in pg-boss v10)
  console.log('Creating queues...');
  await boss.createQueue(QUEUE_NAMES.PROCESS_DOCUMENT);
  await boss.createQueue(QUEUE_NAMES.BULK_PROCESS);
  console.log('Queues created');
  
  // Register handlers
  await boss.work(
    QUEUE_NAMES.PROCESS_DOCUMENT,
    { teamConcurrency: 5 },
    handleProcessDocument
  );
  
  await boss.work(
    QUEUE_NAMES.BULK_PROCESS,
    { teamConcurrency: 1 },
    handleBulkProcess
  );
  
  console.log('Worker handlers registered');
  
  // Handle shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down worker...');
    await boss.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down worker...');
    await boss.stop();
    process.exit(0);
  });
}

// Run if executed directly
if (require.main === module) {
  startWorker().catch((error) => {
    console.error('Worker failed to start:', error);
    process.exit(1);
  });
}

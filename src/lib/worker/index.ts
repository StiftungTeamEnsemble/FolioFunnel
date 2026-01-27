import {
  getBoss,
  QUEUE_NAMES,
  ProcessJobData,
  BulkProcessJobData,
  ColumnProcessorJob,
  PromptRunJob,
} from "@/lib/queue";
import {
  runProcessor,
  createProcessorRun,
} from "@/lib/processors";
import prisma from "@/lib/db";
import { callOpenAI } from "@/lib/openai-client";

// pg-boss v10 passes an array of jobs to the handler
type PgBossJob<T> = { id: string; name: string; data: T };

// ============================================================================
// Column Processor Handler
// ============================================================================

async function handleColumnProcessor(job: ColumnProcessorJob) {
  const { projectId, documentId, columnId, runId } = job;

  console.log(
    `[Worker] Processing document ${documentId} for column ${columnId}`,
  );

  const [document, column] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    prisma.column.findUnique({ where: { id: columnId } }),
  ]);

  if (!document || !column) {
    console.error("[Worker] Document or column not found");
    return;
  }

  const result = await runProcessor({
    document,
    column,
    runId,
    projectId,
  });

  console.log(
    `[Worker] Processor result for document ${documentId} column ${columnId}:`,
    JSON.stringify(result, null, 2),
  );

  console.log(
    `[Worker] Completed processing document ${documentId} for column ${columnId}`,
  );
}

// ============================================================================
// Prompt Run Handler
// ============================================================================

async function handlePromptRun(job: PromptRunJob) {
  const { promptRunId } = job;

  console.log(`[Worker] Processing prompt run ${promptRunId}`);

  const promptRun = await prisma.promptRun.findUnique({
    where: { id: promptRunId },
  });

  if (!promptRun) {
    console.error(`[Worker] Prompt run ${promptRunId} not found`);
    return;
  }

  // Mark as running
  await prisma.promptRun.update({
    where: { id: promptRunId },
    data: { status: "running" },
  });

  // Use shared OpenAI client for the API call
  const response = await callOpenAI({
    model: promptRun.model,
    userPrompt: promptRun.renderedPrompt,
    // No system prompt for direct prompt runs - the user controls the full prompt
  });

  if (!response.success) {
    // Update with failure details including any partial token stats
    await prisma.promptRun.update({
      where: { id: promptRunId },
      data: {
        status: "error",
        error: response.error,
        // Still save token stats even on failure (useful for debugging)
        inputTokenCount: response.tokens.inputTokens ?? undefined,
        outputTokenCount: response.tokens.outputTokens ?? undefined,
        tokenCount: response.tokens.totalTokens ?? undefined,
        costEstimate: response.costEstimate,
      },
    });

    console.log(
      `[Worker] Prompt run ${promptRunId} failed: ${response.error}`,
    );
    return;
  }

  // Update prompt run with success result and full token stats/cost
  await prisma.promptRun.update({
    where: { id: promptRunId },
    data: {
      status: "success",
      result: response.content,
      inputTokenCount: response.tokens.inputTokens ?? undefined,
      outputTokenCount: response.tokens.outputTokens ?? undefined,
      tokenCount: response.tokens.totalTokens ?? undefined,
      costEstimate: response.costEstimate,
    },
  });

  console.log(
    `[Worker] Completed prompt run ${promptRunId} - tokens: ${response.tokens.totalTokens}, cost: $${response.costEstimate?.toFixed(6) ?? "N/A"}`,
  );
}

// ============================================================================
// Unified Process Job Handler
// ============================================================================

async function handleProcessJob(jobs: PgBossJob<ProcessJobData>[]) {
  console.log(`[Worker] handleProcessJob called with ${jobs.length} job(s)`);

  for (const job of jobs) {
    const { data } = job;

    try {
      // Route to appropriate handler based on job type
      switch (data.type) {
        case "column_processor":
          await handleColumnProcessor(data);
          break;
        case "prompt_run":
          await handlePromptRun(data);
          break;
        default:
          // Type guard ensures this is unreachable, but log just in case
          console.error("[Worker] Unknown job type:", (data as any).type);
      }
    } catch (error) {
      console.error("[Worker] Error processing job:", error);
      throw error; // Re-throw to let pg-boss handle retry logic
    }
  }
}

// ============================================================================
// Bulk Process Handler (Orchestration)
// ============================================================================

async function handleBulkProcess(jobs: PgBossJob<BulkProcessJobData>[]) {
  console.log(`[Worker] handleBulkProcess called with ${jobs.length} job(s)`);

  for (const job of jobs) {
    const { projectId, columnId } = job.data;

    console.log(
      `[Worker] Starting bulk process for column ${columnId} in project ${projectId}`,
    );

    try {
      const column = await prisma.column.findUnique({
        where: { id: columnId },
      });
      if (!column) {
        console.error("[Worker] Column not found");
        continue;
      }

      const documents = await prisma.document.findMany({
        where: { projectId },
      });

      const boss = getBoss();

      // Enqueue jobs for each document with rate limiting
      for (const document of documents) {
        const runId = await createProcessorRun(
          projectId,
          document.id,
          columnId,
        );

        // Use unified queue with column_processor type
        await boss.send(
          QUEUE_NAMES.PROCESS_JOB,
          {
            type: "column_processor",
            projectId,
            documentId: document.id,
            columnId,
            runId,
          } satisfies ColumnProcessorJob,
          {
            retryLimit: 2,
            retryDelay: 10,
          },
        );
      }

      console.log(
        `[Worker] Enqueued ${documents.length} jobs for bulk process`,
      );
    } catch (error) {
      console.error("[Worker] Error in bulk process:", error);
      throw error;
    }
  }
}

// ============================================================================
// Worker Startup
// ============================================================================

export async function startWorker() {
  console.log("Starting worker...");

  const boss = getBoss();
  await boss.start();

  console.log("pg-boss started");

  // Create queues (required in pg-boss v10)
  console.log("Creating queues...");
  await boss.createQueue(QUEUE_NAMES.PROCESS_JOB);
  await boss.createQueue(QUEUE_NAMES.BULK_PROCESS);
  console.log("Queues created");

  // Register handlers
  await boss.work(
    QUEUE_NAMES.PROCESS_JOB,
    { teamConcurrency: 5 },
    handleProcessJob,
  );

  await boss.work(
    QUEUE_NAMES.BULK_PROCESS,
    { teamConcurrency: 1 },
    handleBulkProcess,
  );

  console.log("Worker handlers registered");

  // Handle shutdown
  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM, shutting down worker...");
    await boss.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("Received SIGINT, shutting down worker...");
    await boss.stop();
    process.exit(0);
  });
}

// Always start when this file is executed (tsx doesn't set require.main correctly)
startWorker().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});

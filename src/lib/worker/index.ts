import {
  getBoss,
  QUEUE_NAMES,
  ProcessDocumentJobData,
  BulkProcessJobData,
  PromptRunJobData,
} from "@/lib/queue";
import {
  runProcessor,
  createProcessorRun,
  getProcessorColumns,
} from "@/lib/processors";
import prisma from "@/lib/db";
import OpenAI from "openai";
import { calculatePromptCost } from "@/lib/prompt-cost";

// pg-boss v10 passes an array of jobs to the handler
type PgBossJob<T> = { id: string; name: string; data: T };

async function handleProcessDocument(
  jobs: PgBossJob<ProcessDocumentJobData>[],
) {
  console.log(
    `[Worker] handleProcessDocument called with ${jobs.length} job(s)`,
  );

  for (const job of jobs) {
    const { projectId, documentId, columnId, runId } = job.data;

    console.log(
      `[Worker] Processing document ${documentId} for column ${columnId}`,
    );

    try {
      const [document, column] = await Promise.all([
        prisma.document.findUnique({ where: { id: documentId } }),
        prisma.column.findUnique({ where: { id: columnId } }),
      ]);

      if (!document || !column) {
        console.error("[Worker] Document or column not found");
        continue;
      }

      await runProcessor({
        document,
        column,
        runId,
        projectId,
      });

      console.log(
        `[Worker] Completed processing document ${documentId} for column ${columnId}`,
      );
    } catch (error) {
      console.error("[Worker] Error processing document:", error);
      throw error;
    }
  }
}

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

        await boss.send(
          QUEUE_NAMES.PROCESS_DOCUMENT,
          {
            projectId,
            documentId: document.id,
            columnId,
            runId,
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

async function handlePromptRun(jobs: PgBossJob<PromptRunJobData>[]) {
  console.log(`[Worker] handlePromptRun called with ${jobs.length} job(s)`);

  for (const job of jobs) {
    const { promptRunId } = job.data;

    try {
      const promptRun = await prisma.promptRun.findUnique({
        where: { id: promptRunId },
      });

      if (!promptRun) {
        console.error(`[Worker] Prompt run ${promptRunId} not found`);
        continue;
      }

      await prisma.promptRun.update({
        where: { id: promptRunId },
        data: { status: "running" },
      });

      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        await prisma.promptRun.update({
          where: { id: promptRunId },
          data: {
            status: "error",
            error: "OpenAI API key not configured.",
          },
        });
        continue;
      }

      const openai = new OpenAI({ apiKey: openaiApiKey });
      const response = await openai.chat.completions.create({
        model: promptRun.model,
        messages: [{ role: "user", content: promptRun.renderedPrompt }],
      });

      const result = response.choices[0]?.message?.content || "";
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens ?? null;
      const outputTokens = usage?.completion_tokens ?? null;
      const totalTokens = usage?.total_tokens ?? null;
      const costEstimate = calculatePromptCost({
        modelId: promptRun.model,
        inputTokens,
        outputTokens,
      });

      await prisma.promptRun.update({
        where: { id: promptRunId },
        data: {
          status: "success",
          result,
          inputTokenCount: inputTokens ?? undefined,
          outputTokenCount: outputTokens ?? undefined,
          tokenCount: totalTokens ?? undefined,
          costEstimate,
        },
      });
    } catch (error) {
      await prisma.promptRun.update({
        where: { id: promptRunId },
        data: {
          status: "error",
          error: error instanceof Error ? error.message : "Prompt failed.",
        },
      });
    }
  }
}

export async function startWorker() {
  console.log("Starting worker...");

  const boss = getBoss();
  await boss.start();

  console.log("pg-boss started");

  // Create queues (required in pg-boss v10)
  console.log("Creating queues...");
  await boss.createQueue(QUEUE_NAMES.PROCESS_DOCUMENT);
  await boss.createQueue(QUEUE_NAMES.BULK_PROCESS);
  await boss.createQueue(QUEUE_NAMES.PROMPT_RUN);
  console.log("Queues created");

  // Register handlers
  await boss.work(
    QUEUE_NAMES.PROCESS_DOCUMENT,
    { teamConcurrency: 5 },
    handleProcessDocument,
  );

  await boss.work(
    QUEUE_NAMES.BULK_PROCESS,
    { teamConcurrency: 1 },
    handleBulkProcess,
  );

  await boss.work(
    QUEUE_NAMES.PROMPT_RUN,
    { teamConcurrency: 3 },
    handlePromptRun,
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

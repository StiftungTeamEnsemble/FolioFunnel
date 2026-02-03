import { ProcessorContext, ProcessorResult } from "./index";
import prisma from "@/lib/db";
import OpenAI from "openai";

interface EmbeddingsConfig {
  sourceColumnKey?: string;
  useChunks: boolean;
  model: string;
}

const DEFAULT_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;
const BATCH_SIZE = 100;

export async function createEmbeddings(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  const config = (column.processorConfig as unknown as EmbeddingsConfig) || {};
  const model = config.model || DEFAULT_MODEL;
  const useChunks = config.useChunks !== false;
  const sourceColumnKey = config.sourceColumnKey;

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return { success: false, error: "OpenAI API key not configured" };
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  const startTime = Date.now();
  let totalTokens = 0;
  let embeddingsCreated = 0;

  try {
    // Delete existing embeddings for this document/column
    await prisma.$executeRaw`
      DELETE FROM embeddings 
      WHERE document_id = ${document.id}::uuid 
      AND source_column_key = ${column.key}
    `;

    if (useChunks) {
      // Get chunks for this document
      const chunks = await prisma.chunk.findMany({
        where: {
          documentId: document.id,
          sourceColumnKey: sourceColumnKey || column.key,
        },
        orderBy: { chunkIndex: "asc" },
      });

      if (chunks.length === 0) {
        return {
          success: false,
          error: "No chunks found for embedding. Run chunk processor first.",
        };
      }

      // Process in batches
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map((c) => c.text);

        const response = await openai.embeddings.create({
          model,
          input: texts,
        });

        totalTokens += response.usage?.total_tokens || 0;

        // Store embeddings
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = response.data[j].embedding;

          // Use raw SQL for pgvector
          await prisma.$executeRaw`
            INSERT INTO embeddings (id, project_id, document_id, chunk_id, source_column_key, embedding, model, meta, created_at)
            VALUES (
              gen_random_uuid(),
              ${document.projectId}::uuid,
              ${document.id}::uuid,
              ${chunk.id}::uuid,
              ${column.key},
              ${JSON.stringify(embedding)}::vector,
              ${model},
              ${JSON.stringify({ chunkIndex: chunk.chunkIndex })}::jsonb,
              NOW()
            )
          `;

          embeddingsCreated++;
        }
      }
    } else {
      // Embed the column value directly
      if (!sourceColumnKey) {
        return {
          success: false,
          error: "Source column key is required when not using chunks",
        };
      }

      const values = (document.values as Record<string, unknown>) || {};
      const text = values[sourceColumnKey];

      if (typeof text !== "string" || !text.trim()) {
        return {
          success: false,
          error: `Source column '${sourceColumnKey}' does not contain text`,
        };
      }

      const response = await openai.embeddings.create({
        model,
        input: text,
      });

      totalTokens = response.usage?.total_tokens || 0;
      const embedding = response.data[0].embedding;

      // Store embedding
      await prisma.$executeRaw`
        INSERT INTO embeddings (id, project_id, document_id, chunk_id, source_column_key, embedding, model, meta, created_at)
        VALUES (
          gen_random_uuid(),
          ${document.projectId}::uuid,
          ${document.id}::uuid,
          NULL,
          ${column.key},
          ${JSON.stringify(embedding)}::vector,
          ${model},
          ${JSON.stringify({ textLength: text.length })}::jsonb,
          NOW()
        )
      `;

      embeddingsCreated = 1;
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      value: `Created ${embeddingsCreated} embeddings`,
      meta: {
        duration,
        embeddingsCreated,
        totalTokens,
        model,
        dimension: EMBEDDING_DIMENSION,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create embeddings",
    };
  }
}

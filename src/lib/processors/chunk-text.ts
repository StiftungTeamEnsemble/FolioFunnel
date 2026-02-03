import { ProcessorContext, ProcessorResult } from "./index";
import { encodingForModel, TiktokenModel } from "js-tiktoken";
import prisma from "@/lib/db";
import {
  DEFAULT_CHAT_MODEL,
  getTiktokenModel,
  isValidChatModel,
} from "@/lib/models";

interface ChunkConfig {
  sourceColumnKey: string;
  chunkSize: number;
  chunkOverlap: number;
  storeInChunksTable: boolean;
  model?: string;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

function splitTokensIntoChunks(
  tokens: number[],
  chunkSize: number,
  overlap: number,
): number[][] {
  if (!tokens || tokens.length === 0) {
    return [];
  }

  const chunks: number[][] = [];
  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + chunkSize, tokens.length);
    const chunk = tokens.slice(start, end);

    chunks.push(chunk);

    // Move start position considering overlap
    start = end - overlap;
    if (start >= tokens.length - overlap) {
      break; // Avoid infinite loop
    }
  }

  return chunks;
}

export async function chunkText(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  const config = (column.processorConfig as unknown as ChunkConfig) || {};
  const sourceColumnKey = config.sourceColumnKey;
  const chunkSize = config.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkOverlap = config.chunkOverlap || DEFAULT_CHUNK_OVERLAP;
  const storeInChunksTable = config.storeInChunksTable !== false;
  const requestedModel = config.model || DEFAULT_CHAT_MODEL;
  const validatedModel = isValidChatModel(requestedModel)
    ? requestedModel
    : DEFAULT_CHAT_MODEL;
  const tiktokenModel = getTiktokenModel(validatedModel) as TiktokenModel;

  if (!sourceColumnKey) {
    return {
      success: false,
      error: "Source column key is required for chunk_text processor",
    };
  }

  const startTime = Date.now();

  // Get source text from document values
  const values = (document.values as Record<string, unknown>) || {};
  const sourceText = values[sourceColumnKey];

  if (sourceText === undefined || sourceText === null) {
    if (storeInChunksTable) {
      await prisma.chunk.deleteMany({
        where: {
          documentId: document.id,
          sourceColumnKey: column.key,
        },
      });
    }

    return {
      success: true,
      value: [],
      meta: {
        duration: Date.now() - startTime,
        model: validatedModel,
        note: "Source column is empty",
      },
    };
  }

  if (typeof sourceText !== "string") {
    return {
      success: false,
      error: `Source column "${sourceColumnKey}" is not a string`,
    };
  }

  if (!sourceText || sourceText.trim().length === 0) {
    if (storeInChunksTable) {
      await prisma.chunk.deleteMany({
        where: {
          documentId: document.id,
          sourceColumnKey: column.key,
        },
      });
    }

    return {
      success: true,
      value: [],
      meta: {
        duration: Date.now() - startTime,
        model: validatedModel,
        note: "Source column is empty",
      },
    };
  }

  try {
    const encoder = encodingForModel(tiktokenModel);
    const tokens = encoder.encode(sourceText);
    const tokenChunks = splitTokensIntoChunks(tokens, chunkSize, chunkOverlap);
    const chunks = tokenChunks
      .map((chunkTokens) => encoder.decode(chunkTokens).trim())
      .filter((chunk) => chunk.length > 0);

    if (chunks.length === 0) {
      return {
        success: false,
        error: "No chunks generated from source text",
      };
    }

    // Store in chunks table if configured
    if (storeInChunksTable) {
      // Delete existing chunks for this document/column
      await prisma.chunk.deleteMany({
        where: {
          documentId: document.id,
          sourceColumnKey: column.key,
        },
      });

      // Create new chunks
      await prisma.chunk.createMany({
        data: chunks.map((text, index) => ({
          projectId: document.projectId,
          documentId: document.id,
          sourceColumnKey: column.key,
          chunkIndex: index,
          text,
          meta: {
            chunkSize,
            chunkOverlap,
            originalLength: tokens.length,
            originalTextLength: sourceText.length,
            model: validatedModel,
            tiktokenModel,
          },
        })),
      });
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      value: chunks, // Store as text array
      meta: {
        duration,
        chunkCount: chunks.length,
        chunkSize,
        chunkOverlap,
        sourceLength: tokens.length,
        sourceTextLength: sourceText.length,
        model: validatedModel,
        tiktokenModel,
        storedInTable: storeInChunksTable,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to chunk text",
    };
  }
}

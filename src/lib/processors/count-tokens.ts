import { ProcessorContext, ProcessorResult } from "./index";
import { encodingForModel, TiktokenModel } from "js-tiktoken";
import {
  getTiktokenModel,
  isValidChatModel,
  DEFAULT_CHAT_MODEL,
} from "@/lib/models";

interface CountTokensConfig {
  sourceColumnKey?: string;
  model?: string;
}

export async function countTokens(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  const config = (column.processorConfig as CountTokensConfig) || {};
  const sourceColumnKey = config.sourceColumnKey;

  // Validate model against allowed list, fallback to default if invalid
  const requestedModel = config.model || DEFAULT_CHAT_MODEL;
  const validatedModel = isValidChatModel(requestedModel)
    ? requestedModel
    : DEFAULT_CHAT_MODEL;
  const tiktokenModel = getTiktokenModel(validatedModel) as TiktokenModel;

  if (!sourceColumnKey) {
    return { success: false, error: "Source column key is required" };
  }

  const startTime = Date.now();

  try {
    // Get source text from document values
    const values = document.values as Record<string, unknown> | null;
    const sourceText = values?.[sourceColumnKey];

    if (sourceText === undefined || sourceText === null) {
      return {
        success: true,
        value: 0,
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

    // Count tokens using js-tiktoken with validated model
    const enc = encodingForModel(tiktokenModel);
    const tokens = enc.encode(sourceText);
    const tokenCount = tokens.length;

    const duration = Date.now() - startTime;

    return {
      success: true,
      value: tokenCount,
      meta: {
        duration,
        model: validatedModel,
        tiktokenModel,
        sourceColumnKey,
        textLength: sourceText.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to count tokens",
    };
  }
}

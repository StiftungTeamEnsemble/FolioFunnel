/**
 * Unified OpenAI Client
 *
 * Shared utility for all OpenAI API calls - used by both column processors
 * and prompt runs. Handles token counting, cost calculation, and error handling.
 */

import OpenAI from "openai";
import {
  getModelConfig,
  isValidChatModel,
  DEFAULT_CHAT_MODEL,
} from "@/lib/models";
import { calculatePromptCost } from "@/lib/prompt-cost";

// ============================================================================
// Types
// ============================================================================

export interface OpenAIRequestConfig {
  /** The model to use (will be validated and fallback to default if invalid) */
  model: string;
  /** The user prompt/message content */
  userPrompt: string;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Maximum completion tokens (optional) */
  maxTokens?: number;
}

export interface OpenAITokenStats {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface OpenAIResponse {
  success: boolean;
  /** The completion text (only on success) */
  content?: string;
  /** Error message (only on failure) */
  error?: string;
  /** The model that was actually used */
  model: string;
  /** Token usage statistics */
  tokens: OpenAITokenStats;
  /** Calculated cost in USD */
  costEstimate: number | null;
  /** Why the completion stopped */
  finishReason: string | null;
  /** Duration of the API call in milliseconds */
  durationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_TOKENS = 60000;
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant that processes documents.";

// ============================================================================
// OpenAI Client
// ============================================================================

/**
 * Call OpenAI Chat Completions API with unified error handling and stats tracking
 */
export async function callOpenAI(
  config: OpenAIRequestConfig,
): Promise<OpenAIResponse> {
  const startTime = Date.now();

  // Validate and normalize model
  const requestedModel = config.model || DEFAULT_CHAT_MODEL;
  const model = isValidChatModel(requestedModel)
    ? requestedModel
    : DEFAULT_CHAT_MODEL;
  const modelConfig = getModelConfig(model);
  const apiModel = modelConfig?.apiModel ?? model;
  const serviceTier = modelConfig?.serviceTier;

  const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const requestedMaxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxTokens = modelConfig?.maxCompletionTokens
    ? Math.min(requestedMaxTokens, modelConfig.maxCompletionTokens)
    : requestedMaxTokens;

  // Check for API key
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      success: false,
      error: "OpenAI API key not configured",
      model,
      tokens: { inputTokens: null, outputTokens: null, totalTokens: null },
      costEstimate: null,
      finishReason: null,
      durationMs: Date.now() - startTime,
    };
  }

  // Validate user prompt
  if (!config.userPrompt?.trim()) {
    return {
      success: false,
      error: "User prompt is empty",
      model,
      tokens: { inputTokens: null, outputTokens: null, totalTokens: null },
      costEstimate: null,
      finishReason: null,
      durationMs: Date.now() - startTime,
    };
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  try {
    console.log(
      `[OpenAI] Calling model ${model} with ${config.userPrompt.length} char prompt`,
    );

    const response = await openai.chat.completions.create({
      model: apiModel,
      service_tier: serviceTier,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: config.userPrompt },
      ],
    });

    const durationMs = Date.now() - startTime;
    const completion = response.choices[0]?.message?.content || "";
    const usage = response.usage;
    const finishReason = response.choices[0]?.finish_reason || null;

    // Extract token stats
    const tokens: OpenAITokenStats = {
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
    };

    // Calculate cost
    const costEstimate = calculatePromptCost({
      modelId: model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
    });

    console.log(
      `[OpenAI] Response received in ${durationMs}ms - tokens: ${tokens.totalTokens}, cost: $${costEstimate?.toFixed(6) ?? "N/A"}, finish: ${finishReason}`,
    );

    // Check for empty completion
    if (!completion) {
      let errorMessage: string;
      if (finishReason === "length") {
        errorMessage = `The AI output was cut off because it reached the maximum token limit (${maxTokens}).`;
      } else {
        errorMessage =
          "The AI did not return any output. Please check your prompt and settings.";
      }

      return {
        success: false,
        error: errorMessage,
        model,
        tokens,
        costEstimate,
        finishReason,
        durationMs,
      };
    }

    return {
      success: true,
      content: completion,
      model,
      tokens,
      costEstimate,
      finishReason,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Failed to call OpenAI API";

    console.error(`[OpenAI] API error after ${durationMs}ms:`, error);

    return {
      success: false,
      error: errorMessage,
      model,
      tokens: { inputTokens: null, outputTokens: null, totalTokens: null },
      costEstimate: null,
      finishReason: null,
      durationMs,
    };
  }
}

/**
 * Simplified call for prompt runs that only need user prompt (no system prompt)
 */
export async function callOpenAISimple(
  model: string,
  userPrompt: string,
): Promise<OpenAIResponse> {
  return callOpenAI({
    model,
    userPrompt,
    // No system prompt for simple prompt runs
    systemPrompt: undefined,
  });
}

import { ProcessorContext, ProcessorResult, expandTemplate } from "./index";
import OpenAI from "openai";
import { isValidChatModel, DEFAULT_CHAT_MODEL } from "@/lib/models";

interface AITransformConfig {
  model: string;
  promptTemplate: string;
  maxTokens?: number;
  systemPrompt?: string;
  outputType?: "text" | "number";
  autoConvert?: boolean;
}

const DEFAULT_MAX_TOKENS = 60000;

export async function aiTransform(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  const config = (column.processorConfig as AITransformConfig) || {};

  // Validate model against allowed list, fallback to default if invalid
  const requestedModel = config.model || DEFAULT_CHAT_MODEL;
  const model = isValidChatModel(requestedModel)
    ? requestedModel
    : DEFAULT_CHAT_MODEL;
  const promptTemplate = config.promptTemplate;
  const maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
  const outputType = config.outputType || "text";
  const autoConvert = config.autoConvert ?? false;

  let systemPrompt =
    config.systemPrompt ||
    "You are a helpful assistant that processes documents.";

  // If outputType is number, add instruction to return only a number
  if (outputType === "number") {
    systemPrompt +=
      "\n\nIMPORTANT: Your response must be ONLY a single number (integer or decimal). Do not include any text, units, or explanations.";
  }

  if (!promptTemplate) {
    return {
      success: false,
      error: "Prompt template is required for AI transform processor",
    };
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return { success: false, error: "OpenAI API key not configured" };
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  const startTime = Date.now();

  try {
    // Build context values from document
    const values = (document.values as Record<string, unknown>) || {};
    const documentContext: Record<string, unknown> = {
      id: document.id,
      title: document.title,
      sourceType: document.sourceType,
      sourceUrl: document.sourceUrl,
      ...values,
    };

    const contextValues: Record<string, unknown> = {
      document: documentContext,
      ...documentContext,
    };

    // Expand template
    const userPrompt = expandTemplate(promptTemplate, contextValues);
    console.log("[AITransform] Expanded prompt:", userPrompt);
    if (!userPrompt.trim()) {
      console.error(
        "[AITransform] Expanded prompt is empty. Check column references.",
      );
      return {
        success: false,
        error: "Expanded prompt is empty. Check column references.",
      };
    }

    // Call OpenAI
    let response;
    try {
      response = await openai.chat.completions.create({
        model,
        max_completion_tokens: maxTokens, // todo: remove?
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
    } catch (apiError) {
      console.error("[AITransform] OpenAI API error:", apiError);
      return {
        success: false,
        error:
          apiError instanceof Error
            ? apiError.message
            : "Failed to call OpenAI API",
      };
    }

    let completion = response.choices[0]?.message?.content || "";
    const usage = response.usage;
    const finishReason = response.choices[0]?.finish_reason;
    console.log(
      "[AITransform] OpenAI response:",
      JSON.stringify(response, null, 2),
    );

    // Write token counts and price to DB if promptRunId is available in context
    if (ctx.promptRunId && usage?.prompt_tokens != null && usage?.completion_tokens != null) {
      // Dynamically import updatePromptRunTokensAndPrice
      const { updatePromptRunTokensAndPrice } = await import("@/app/actions/prompt-runs");
      await updatePromptRunTokensAndPrice({
        promptRunId: ctx.promptRunId,
        inputTokenCount: usage.prompt_tokens,
        outputTokenCount: usage.completion_tokens,
        model,
      });
    }

    if (!completion) {
      console.warn("[AITransform] OpenAI returned empty completion.", response);
      if (finishReason === "length") {
        return {
          success: false,
          error: `The AI output was cut off because it reached the maximum token limit (${maxTokens}).`,
          meta: {
            finishReason,
            promptTokens: usage?.prompt_tokens,
            completionTokens: usage?.completion_tokens,
            totalTokens: usage?.total_tokens,
          },
        };
      } else {
        return {
          success: false,
          error:
            "The AI did not return any output. Please check your prompt and settings.",
          meta: {
            finishReason,
            promptTokens: usage?.prompt_tokens,
            completionTokens: usage?.completion_tokens,
            totalTokens: usage?.total_tokens,
          },
        };
      }
    }

    const duration = Date.now() - startTime;

    // Auto-convert to number if configured
    let finalValue: string | number = completion;
    if (autoConvert && outputType === "number") {
      // Extract number from response (handles cases where model adds extra text)
      const numberMatch = completion.match(/-?\d+\.?\d*/);
      if (numberMatch) {
        const parsed = parseFloat(numberMatch[0]);
        if (!isNaN(parsed)) {
          finalValue = parsed;
        }
      }
    }

    console.log("[AITransform] Final value:", finalValue);
    return {
      success: true,
      value: finalValue,
      meta: {
        duration,
        model,
        outputType,
        autoConverted: autoConvert && outputType === "number",
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        finishReason,
      },
    };
  } catch (error) {
    console.error("[AITransform] Unexpected error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to call OpenAI API",
    };
  }
}

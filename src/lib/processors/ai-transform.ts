import { ProcessorContext, ProcessorResult, expandTemplate } from "./index";
import { callOpenAI } from "@/lib/openai-client";

interface AITransformConfig {
  model: string;
  promptTemplate: string;
  maxTokens?: number;
  systemPrompt?: string;
  outputType?: "text" | "number";
  autoConvert?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant that processes documents.";

export async function aiTransform(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  const config = (column.processorConfig as AITransformConfig) || {};

  const promptTemplate = config.promptTemplate;
  const outputType = config.outputType || "text";
  const autoConvert = config.autoConvert ?? false;

  // Build system prompt with output type instruction if needed
  let systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
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

  // Call OpenAI using shared client
  const response = await callOpenAI({
    model: config.model,
    userPrompt,
    systemPrompt,
    maxTokens: config.maxTokens,
  });

  if (!response.success) {
    return {
      success: false,
      error: response.error,
      meta: {
        model: response.model,
        finishReason: response.finishReason,
        promptTokens: response.tokens.inputTokens,
        completionTokens: response.tokens.outputTokens,
        totalTokens: response.tokens.totalTokens,
        costEstimate: response.costEstimate,
        duration: response.durationMs,
      },
    };
  }

  // Auto-convert to number if configured
  let finalValue: string | number = response.content!;
  if (autoConvert && outputType === "number") {
    // Extract number from response (handles cases where model adds extra text)
    const numberMatch = response.content!.match(/-?\d+\.?\d*/);
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
      duration: response.durationMs,
      model: response.model,
      outputType,
      autoConverted: autoConvert && outputType === "number",
      promptTokens: response.tokens.inputTokens,
      completionTokens: response.tokens.outputTokens,
      totalTokens: response.tokens.totalTokens,
      costEstimate: response.costEstimate,
      finishReason: response.finishReason,
    },
  };
}

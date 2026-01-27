import { encodingForModel, TiktokenModel } from "js-tiktoken";
import { getModelConfig, getTiktokenModel } from "@/lib/models";

const TOKENS_PER_MILLION = 1_000_000;

export function countPromptTokens(prompt: string, modelId: string) {
  const tiktokenModel = getTiktokenModel(modelId) as TiktokenModel;
  const enc = encodingForModel(tiktokenModel);
  const tokens = enc.encode(prompt);
  return tokens.length;
}

export function estimatePromptCost(tokenCount: number, modelId: string) {
  const config = getModelConfig(modelId);
  if (!config?.pricing) return null;
  return (tokenCount / TOKENS_PER_MILLION) * config.pricing.inputPerMillion;
}

export function calculatePromptCost({
  modelId,
  inputTokens,
  outputTokens,
}: {
  modelId: string;
  inputTokens: number | null | undefined;
  outputTokens: number | null | undefined;
}) {
  const config = getModelConfig(modelId);
  if (!config?.pricing) return null;
  if (inputTokens == null || outputTokens == null) return null;

  return (
    (inputTokens / TOKENS_PER_MILLION) * config.pricing.inputPerMillion +
    (outputTokens / TOKENS_PER_MILLION) * config.pricing.outputPerMillion
  );
}

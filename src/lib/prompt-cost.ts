import { encodingForModel, TiktokenModel } from "js-tiktoken";
import { getTiktokenModel } from "@/lib/models";

const CHAT_MODEL_PRICING: Record<string, { inputPer1k: number }> = {
  "gpt-5-nano": { inputPer1k: 0.001 },
  "gpt-4o-mini": { inputPer1k: 0.0015 },
};

export function countPromptTokens(prompt: string, modelId: string) {
  const tiktokenModel = getTiktokenModel(modelId) as TiktokenModel;
  const enc = encodingForModel(tiktokenModel);
  const tokens = enc.encode(prompt);
  return tokens.length;
}

export function estimatePromptCost(tokenCount: number, modelId: string) {
  const pricing = CHAT_MODEL_PRICING[modelId];
  if (!pricing) return null;
  return (tokenCount / 1000) * pricing.inputPer1k;
}

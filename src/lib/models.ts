/**
 * Centralized OpenAI Models Configuration
 * This list is used for:
 * - UI dropdowns (model selection)
 * - Server-side validation
 * - Token counting (tiktoken encoding)
 */

export interface ModelConfig {
  id: string;
  name: string;
  // tiktoken model name for token counting
  tiktokenModel: string;
  // Model category for grouping
  category: 'chat' | 'embedding';
  // Context window size
  contextWindow: number;
}

// Chat/Completion models
export const CHAT_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    tiktokenModel: 'gpt-4o',
    category: 'chat',
    contextWindow: 128000,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    tiktokenModel: 'gpt-4o',
    category: 'chat',
    contextWindow: 128000,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    tiktokenModel: 'gpt-4-turbo',
    category: 'chat',
    contextWindow: 128000,
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    tiktokenModel: 'gpt-4',
    category: 'chat',
    contextWindow: 8192,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    tiktokenModel: 'gpt-3.5-turbo',
    category: 'chat',
    contextWindow: 16385,
  },
];

// Embedding models
export const EMBEDDING_MODELS: ModelConfig[] = [
  {
    id: 'text-embedding-3-small',
    name: 'Text Embedding 3 Small',
    tiktokenModel: 'text-embedding-3-small',
    category: 'embedding',
    contextWindow: 8191,
  },
  {
    id: 'text-embedding-3-large',
    name: 'Text Embedding 3 Large',
    tiktokenModel: 'text-embedding-3-large',
    category: 'embedding',
    contextWindow: 8191,
  },
];

// All models combined
export const ALL_MODELS: ModelConfig[] = [...CHAT_MODELS, ...EMBEDDING_MODELS];

// Valid model IDs for quick validation
export const VALID_CHAT_MODEL_IDS = CHAT_MODELS.map(m => m.id);
export const VALID_EMBEDDING_MODEL_IDS = EMBEDDING_MODELS.map(m => m.id);
export const VALID_MODEL_IDS = ALL_MODELS.map(m => m.id);

/**
 * Validate if a model ID is a valid chat model
 */
export function isValidChatModel(modelId: string): boolean {
  return VALID_CHAT_MODEL_IDS.includes(modelId);
}

/**
 * Validate if a model ID is a valid embedding model
 */
export function isValidEmbeddingModel(modelId: string): boolean {
  return VALID_EMBEDDING_MODEL_IDS.includes(modelId);
}

/**
 * Validate if a model ID is valid (any type)
 */
export function isValidModel(modelId: string): boolean {
  return VALID_MODEL_IDS.includes(modelId);
}

/**
 * Get model config by ID
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return ALL_MODELS.find(m => m.id === modelId);
}

/**
 * Get tiktoken model name for a given model ID
 * Falls back to 'gpt-4o' if model not found
 */
export function getTiktokenModel(modelId: string): string {
  const config = getModelConfig(modelId);
  return config?.tiktokenModel ?? 'gpt-4o';
}

/**
 * Default models
 */
export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

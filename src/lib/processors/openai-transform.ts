import { ProcessorContext, ProcessorResult, expandTemplate } from './index';
import OpenAI from 'openai';
import { isValidChatModel, DEFAULT_CHAT_MODEL } from '@/lib/models';

interface OpenAIConfig {
  model: string;
  temperature: number;
  promptTemplate: string;
  maxTokens?: number;
  systemPrompt?: string;
}

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2000;

export async function openaiTransform(ctx: ProcessorContext): Promise<ProcessorResult> {
  const { document, column } = ctx;
  
  const config = (column.processorConfig as OpenAIConfig) || {};
  
  // Validate model against allowed list, fallback to default if invalid
  const requestedModel = config.model || DEFAULT_CHAT_MODEL;
  const model = isValidChatModel(requestedModel) ? requestedModel : DEFAULT_CHAT_MODEL;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  const promptTemplate = config.promptTemplate;
  const maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
  const systemPrompt = config.systemPrompt || 'You are a helpful assistant that processes documents.';
  
  if (!promptTemplate) {
    return { 
      success: false, 
      error: 'Prompt template is required for OpenAI transform processor' 
    };
  }
  
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return { success: false, error: 'OpenAI API key not configured' };
  }
  
  const openai = new OpenAI({ apiKey: openaiApiKey });
  
  const startTime = Date.now();
  
  try {
    // Build context values from document
    const values = (document.values as Record<string, unknown>) || {};
    const contextValues: Record<string, unknown> = {
      title: document.title,
      sourceType: document.sourceType,
      sourceUrl: document.sourceUrl,
      ...values,
    };
    
    // Expand template
    const userPrompt = expandTemplate(promptTemplate, contextValues);
    
    if (!userPrompt.trim()) {
      return { 
        success: false, 
        error: 'Expanded prompt is empty. Check column references.' 
      };
    }
    
    // Call OpenAI
    const response = await openai.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    
    const completion = response.choices[0]?.message?.content || '';
    const usage = response.usage;
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      value: completion,
      meta: {
        duration,
        model,
        temperature,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        finishReason: response.choices[0]?.finish_reason,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to call OpenAI API',
    };
  }
}

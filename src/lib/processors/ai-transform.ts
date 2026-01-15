import { ProcessorContext, ProcessorResult, expandTemplate } from './index';
import OpenAI from 'openai';
import { isValidChatModel, DEFAULT_CHAT_MODEL } from '@/lib/models';

interface AITransformConfig {
  model: string;
  temperature: number;
  promptTemplate: string;
  maxTokens?: number;
  systemPrompt?: string;
  outputType?: 'text' | 'number';
  autoConvert?: boolean;
}

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2000;

export async function aiTransform(ctx: ProcessorContext): Promise<ProcessorResult> {
  const { document, column } = ctx;
  
  const config = (column.processorConfig as AITransformConfig) || {};
  
  // Validate model against allowed list, fallback to default if invalid
  const requestedModel = config.model || DEFAULT_CHAT_MODEL;
  const model = isValidChatModel(requestedModel) ? requestedModel : DEFAULT_CHAT_MODEL;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  const promptTemplate = config.promptTemplate;
  const maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
  const outputType = config.outputType || 'text';
  const autoConvert = config.autoConvert ?? false;
  
  let systemPrompt = config.systemPrompt || 'You are a helpful assistant that processes documents.';
  
  // If outputType is number, add instruction to return only a number
  if (outputType === 'number') {
    systemPrompt += '\n\nIMPORTANT: Your response must be ONLY a single number (integer or decimal). Do not include any text, units, or explanations.';
  }
  
  if (!promptTemplate) {
    return { 
      success: false, 
      error: 'Prompt template is required for AI transform processor' 
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
    
    let completion = response.choices[0]?.message?.content || '';
    const usage = response.usage;
    
    const duration = Date.now() - startTime;
    
    // Auto-convert to number if configured
    let finalValue: string | number = completion;
    if (autoConvert && outputType === 'number') {
      // Extract number from response (handles cases where model adds extra text)
      const numberMatch = completion.match(/-?\d+\.?\d*/);
      if (numberMatch) {
        const parsed = parseFloat(numberMatch[0]);
        if (!isNaN(parsed)) {
          finalValue = parsed;
        }
      }
    }
    
    return {
      success: true,
      value: finalValue,
      meta: {
        duration,
        model,
        temperature,
        outputType,
        autoConverted: autoConvert && outputType === 'number',
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

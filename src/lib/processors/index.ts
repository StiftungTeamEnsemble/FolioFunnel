import prisma from '@/lib/db';
import { ProcessorType, RunStatus, Document, Column } from '@prisma/client';
import { pdfToMarkdownMupdf } from './pdf-to-markdown-mupdf';
import { pdfToMetadata } from './pdf-to-metadata';
import { urlToText } from './url-to-text';
import { urlToMarkdown } from './url-to-markdown';
import { chunkText } from './chunk-text';
import { createEmbeddings } from './create-embeddings';
import { aiTransform } from './ai-transform';
import { countTokens } from './count-tokens';

export interface ProcessorContext {
  document: Document;
  column: Column;
  runId: string;
}

export interface ProcessorResult {
  success: boolean;
  value?: unknown;
  error?: string;
  meta?: Record<string, unknown>;
}

type ProcessorFunction = (ctx: ProcessorContext) => Promise<ProcessorResult>;

const processors: Record<ProcessorType, ProcessorFunction> = {
  pdf_to_markdown_mupdf: pdfToMarkdownMupdf,
  pdf_to_metadata: pdfToMetadata,
  url_to_text: urlToText,
  url_to_markdown: urlToMarkdown,
  chunk_text: chunkText,
  create_embeddings: createEmbeddings,
  ai_transform: aiTransform,
  count_tokens: countTokens,
};

export async function runProcessor(ctx: ProcessorContext): Promise<ProcessorResult> {
  const { column, runId } = ctx;
  
  if (!column.processorType) {
    return { success: false, error: 'No processor type configured' };
  }
  
  const processorFn = processors[column.processorType];
  if (!processorFn) {
    return { success: false, error: `Unknown processor type: ${column.processorType}` };
  }
  
  // Mark as running
  await prisma.processorRun.update({
    where: { id: runId },
    data: {
      status: RunStatus.running,
      startedAt: new Date(),
    },
  });
  
  try {
    const result = await processorFn(ctx);
    
    // Update run status
    await prisma.processorRun.update({
      where: { id: runId },
      data: {
        status: result.success ? RunStatus.success : RunStatus.error,
        finishedAt: new Date(),
        error: result.error,
        meta: result.meta as any,
      },
    });
    
    // Update document values if successful
    if (result.success && result.value !== undefined) {
      const currentDoc = await prisma.document.findUnique({
        where: { id: ctx.document.id },
      });
      
      if (currentDoc) {
        const values = (currentDoc.values as Record<string, unknown>) || {};
        values[column.key] = result.value;
        
        await prisma.document.update({
          where: { id: ctx.document.id },
          data: { values },
        });
      }
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await prisma.processorRun.update({
      where: { id: runId },
      data: {
        status: RunStatus.error,
        finishedAt: new Date(),
        error: errorMessage,
      },
    });
    
    return { success: false, error: errorMessage };
  }
}

// Create a processor run record
export async function createProcessorRun(
  projectId: string,
  documentId: string,
  columnId: string
): Promise<string> {
  const run = await prisma.processorRun.create({
    data: {
      projectId,
      documentId,
      columnId,
      status: RunStatus.queued,
    },
  });
  return run.id;
}

// Get processor columns for a project
export async function getProcessorColumns(projectId: string) {
  return prisma.column.findMany({
    where: {
      projectId,
      mode: 'processor',
      processorType: { not: null },
    },
  });
}

// Expand template variables in a string
export function expandTemplate(
  template: string,
  values: Record<string, unknown>
): string {
  const resolveValue = (context: Record<string, unknown>, path: string) => {
    if (path === 'this') return context.this ?? context;
    if (path === '@index') return context['@index'];

    return path.split('.').reduce<unknown>((current, key) => {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, context);
  };

  const renderTemplate = (
    input: string,
    context: Record<string, unknown>
  ): string => {
    let output = input;

    output = output.replace(
      /{{#each\s+([^}]+)}}([\s\S]*?){{\/each}}/g,
      (_, rawPath, inner) => {
        const path = rawPath.trim();
        const value = resolveValue(context, path);
        if (!Array.isArray(value)) return '';

        return value
          .map((item, index) => {
            const childContext =
              item && typeof item === 'object'
                ? { ...context, ...(item as Record<string, unknown>) }
                : { ...context };

            childContext.this = item;
            childContext['@index'] = index;

            return renderTemplate(inner, childContext);
          })
          .join('');
      }
    );

    output = output.replace(
      /{{#if\s+([^}]+)}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g,
      (_, rawPath, truthyBlock, falsyBlock) => {
        const path = rawPath.trim();
        const value = resolveValue(context, path);
        if (value) {
          return renderTemplate(truthyBlock, context);
        }
        return falsyBlock ? renderTemplate(falsyBlock, context) : '';
      }
    );

    output = output.replace(
      /{{{?\s*truncate\s+([^}\s]+)\s+(\d+)\s*}}}?/g,
      (_, rawPath, rawLength) => {
        const path = rawPath.trim();
        const value = resolveValue(context, path);
        if (value === undefined || value === null) return '';
        const length = Number(rawLength);
        if (!Number.isFinite(length) || length <= 0) return '';

        const text =
          typeof value === 'string' ? value : JSON.stringify(value);
        if (text.length <= length) return text;
        return text.slice(0, length);
      }
    );

    output = output.replace(/{{{\s*([^}]+)\s*}}}/g, (_, rawPath) => {
      const path = rawPath.trim();
      const value = resolveValue(context, path);
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    });

    output = output.replace(/{{\s*([^#/{][^}]*)}}/g, (_, rawPath) => {
      const path = rawPath.trim();
      const value = resolveValue(context, path);
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    });

    return output;
  };

  return renderTemplate(template, values);
}

import prisma from "@/lib/db";
import Handlebars from "handlebars";
import { ProcessorType, RunStatus, Document, Column } from "@prisma/client";
import { pdfToMarkdownMupdf } from "./pdf-to-markdown-mupdf";
import { pdfToMetadata } from "./pdf-to-metadata";
import { pdfToThumbnailMupdf } from "./pdf-to-thumbnail-mupdf";
import { documentToMarkdown } from "./document-to-markdown";
import { documentToMetadata } from "./document-to-metadata";
import { urlToHtml } from "./url-to-html";
import { urlToMarkdown } from "./url-to-markdown";
import { chunkText } from "./chunk-text";
import { createEmbeddings } from "./create-embeddings";
import { aiTransform } from "./ai-transform";
import { countTokens } from "./count-tokens";
import { enqueueProcessDocument } from "@/lib/queue";

export interface ProcessorContext {
  document: Document;
  column: Column;
  runId: string;
  projectId: string;
}

export interface ProcessorResult {
  success: boolean;
  value?: unknown;
  error?: string;
  meta?: Record<string, unknown>;
}

type ProcessorFunction = (ctx: ProcessorContext) => Promise<ProcessorResult>;

const processors: Record<ProcessorType, ProcessorFunction> = {
  document_to_markdown: documentToMarkdown,
  document_to_metadata: documentToMetadata,
  pdf_to_markdown_mupdf: pdfToMarkdownMupdf,
  pdf_to_metadata: pdfToMetadata,
  pdf_to_thumbnail_mupdf: pdfToThumbnailMupdf,
  url_to_html: urlToHtml,
  url_to_markdown: urlToMarkdown,
  chunk_text: chunkText,
  create_embeddings: createEmbeddings,
  ai_transform: aiTransform,
  count_tokens: countTokens,
};

export async function runProcessor(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { column, runId } = ctx;

  if (!column.processorType) {
    return { success: false, error: "No processor type configured" };
  }

  const processorFn = processors[column.processorType];
  if (!processorFn) {
    return {
      success: false,
      error: `Unknown processor type: ${column.processorType}`,
    };
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

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
  columnId: string,
): Promise<string> {
  const run = await prisma.processorRun.create({
    data: {
      projectId,
      documentId,
      columnId,
      status: RunStatus.queued,
    },
  });

  // Enqueue the job to the worker
  await enqueueProcessDocument({
    projectId,
    documentId,
    columnId,
    runId: run.id,
  });

  return run.id;
}

// Get processor columns for a project
export async function getProcessorColumns(projectId: string) {
  return prisma.column.findMany({
    where: {
      projectId,
      mode: "processor",
      processorType: { not: null },
    },
  });
}

// Expand template variables in a string
export function expandTemplate(
  template: string,
  values: Record<string, unknown>,
): string {
  const handlebars = Handlebars.create();
  handlebars.registerHelper("truncate", (value: unknown, length: number) => {
    if (value === undefined || value === null) return "";
    const safeLength = Number(length);
    if (!Number.isFinite(safeLength) || safeLength <= 0) return "";

    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text.length <= safeLength) return text;
    return text.slice(0, safeLength);
  });

  const compiledTemplate = handlebars.compile(template, { noEscape: true });
  return compiledTemplate(values);
}

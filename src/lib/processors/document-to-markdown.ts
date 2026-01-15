import { ProcessorContext, ProcessorResult } from './index';
import { pdfToMarkdownMupdf } from './pdf-to-markdown-mupdf';
import { urlToMarkdown } from './url-to-markdown';

export async function documentToMarkdown(
  ctx: ProcessorContext
): Promise<ProcessorResult> {
  const { document } = ctx;

  if (document.sourceType === 'upload') {
    if (document.mimeType !== 'application/pdf') {
      return { success: false, error: 'Document is not a PDF' };
    }
    return pdfToMarkdownMupdf(ctx);
  }

  if (document.sourceType === 'url') {
    return urlToMarkdown(ctx);
  }

  return {
    success: false,
    error: 'Document to Markdown processor only works with PDF or URL documents',
  };
}

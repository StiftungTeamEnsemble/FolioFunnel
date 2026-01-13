import { ProcessorContext, ProcessorResult } from './index';
import { readFile } from '@/lib/storage';

const MARKER_API_URL = process.env.MARKER_API_URL || 'http://marker-api:8080';
const MARKER_API_KEY = process.env.MARKER_API_KEY || 'marker_secret_key';

export async function pdfToMarkdown(ctx: ProcessorContext): Promise<ProcessorResult> {
  const { document } = ctx;
  
  // Only works for uploaded PDFs
  if (document.sourceType !== 'upload') {
    return { 
      success: false, 
      error: 'PDF to Markdown processor only works with uploaded documents' 
    };
  }
  
  if (!document.filePath) {
    return { success: false, error: 'No file path found for document' };
  }
  
  if (document.mimeType !== 'application/pdf') {
    return { success: false, error: 'Document is not a PDF' };
  }
  
  const startTime = Date.now();
  
  try {
    // Read the PDF file
    const fileBuffer = await readFile(document.filePath);
    
    // Create form data
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('file', blob, 'document.pdf');
    
    // Call marker API
    const response = await fetch(`${MARKER_API_URL}/convert`, {
      method: 'POST',
      headers: {
        'X-API-Key': MARKER_API_KEY,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { 
        success: false, 
        error: `Marker API error: ${error.error || response.statusText}` 
      };
    }
    
    const result = await response.json();
    
    if (!result.success) {
      return { success: false, error: result.error || 'Conversion failed' };
    }
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      value: result.markdown,
      meta: {
        duration,
        markdownLength: result.markdown.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert PDF',
    };
  }
}

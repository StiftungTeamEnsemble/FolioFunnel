import { ProcessorContext, ProcessorResult } from './index';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT = 30000; // 30 seconds
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
];

function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Check against private IP patterns
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return true;
      }
    }
    
    // Block file:// and other non-http protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return true;
    }
    
    return false;
  } catch {
    return true; // Invalid URL, block it
  }
}

export async function urlToText(ctx: ProcessorContext): Promise<ProcessorResult> {
  const { document } = ctx;
  
  // Only works for URL documents
  if (document.sourceType !== 'url') {
    return { 
      success: false, 
      error: 'URL to Text processor only works with URL documents' 
    };
  }
  
  if (!document.sourceUrl) {
    return { success: false, error: 'No URL found for document' };
  }
  
  // SSRF protection
  if (isPrivateUrl(document.sourceUrl)) {
    return { 
      success: false, 
      error: 'URL points to a private/internal address' 
    };
  }
  
  const startTime = Date.now();
  
  try {
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    
    const response = await fetch(document.sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FolioFunnel/1.0 (Document Processor)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { 
        success: false, 
        error: `Failed to fetch URL: ${response.status} ${response.statusText}` 
      };
    }
    
    // Check content type
    const contentType = response.headers.get('content-type') || '';
    const isAllowedType = ALLOWED_CONTENT_TYPES.some(t => contentType.includes(t));
    
    if (!isAllowedType) {
      return { 
        success: false, 
        error: `Unsupported content type: ${contentType}` 
      };
    }
    
    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) {
      return { 
        success: false, 
        error: `Content too large: ${contentLength} bytes` 
      };
    }
    
    // Read response body with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: 'Failed to read response body' };
    }
    
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      totalSize += value.length;
      if (totalSize > MAX_DOWNLOAD_SIZE) {
        reader.cancel();
        return { success: false, error: 'Content too large' };
      }
      
      chunks.push(value);
    }
    
    const html = new TextDecoder().decode(
      new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[]))
    );
    
    // Parse with JSDOM and Readability
    const dom = new JSDOM(html, { url: document.sourceUrl });
    const reader2 = new Readability(dom.window.document);
    const article = reader2.parse();
    
    if (!article) {
      return { 
        success: false, 
        error: 'Could not extract readable content from URL' 
      };
    }
    
    const duration = Date.now() - startTime;
    
    // Return text content (or markdown-like format)
    const textContent = article.textContent?.trim() || '';
    
    return {
      success: true,
      value: textContent,
      meta: {
        duration,
        title: article.title,
        byline: article.byline,
        excerpt: article.excerpt,
        textLength: textContent.length,
        siteName: article.siteName,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timed out' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch URL',
    };
  }
}

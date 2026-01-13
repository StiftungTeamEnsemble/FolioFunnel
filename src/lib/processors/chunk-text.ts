import { ProcessorContext, ProcessorResult } from './index';
import prisma from '@/lib/db';

interface ChunkConfig {
  sourceColumnKey: string;
  chunkSize: number;
  chunkOverlap: number;
  storeInChunksTable: boolean;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  if (!text || text.length === 0) {
    return [];
  }
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move start position considering overlap
    start = end - overlap;
    if (start >= text.length - overlap) {
      break; // Avoid infinite loop
    }
  }
  
  // Handle case where we end exactly at text length
  if (chunks.length === 0 && text.trim().length > 0) {
    chunks.push(text.trim());
  }
  
  return chunks;
}

export async function chunkText(ctx: ProcessorContext): Promise<ProcessorResult> {
  const { document, column } = ctx;
  
  const config = (column.processorConfig as ChunkConfig) || {};
  const sourceColumnKey = config.sourceColumnKey;
  const chunkSize = config.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkOverlap = config.chunkOverlap || DEFAULT_CHUNK_OVERLAP;
  const storeInChunksTable = config.storeInChunksTable !== false;
  
  if (!sourceColumnKey) {
    return { 
      success: false, 
      error: 'Source column key is required for chunk_text processor' 
    };
  }
  
  // Get source text from document values
  const values = (document.values as Record<string, unknown>) || {};
  const sourceText = values[sourceColumnKey];
  
  if (typeof sourceText !== 'string') {
    return { 
      success: false, 
      error: `Source column '${sourceColumnKey}' does not contain text` 
    };
  }
  
  if (!sourceText || sourceText.trim().length === 0) {
    return { 
      success: false, 
      error: `Source column '${sourceColumnKey}' is empty` 
    };
  }
  
  const startTime = Date.now();
  
  try {
    // Split text into chunks
    const chunks = splitIntoChunks(sourceText, chunkSize, chunkOverlap);
    
    if (chunks.length === 0) {
      return { 
        success: false, 
        error: 'No chunks generated from source text' 
      };
    }
    
    // Store in chunks table if configured
    if (storeInChunksTable) {
      // Delete existing chunks for this document/column
      await prisma.chunk.deleteMany({
        where: {
          documentId: document.id,
          sourceColumnKey: column.key,
        },
      });
      
      // Create new chunks
      await prisma.chunk.createMany({
        data: chunks.map((text, index) => ({
          projectId: document.projectId,
          documentId: document.id,
          sourceColumnKey: column.key,
          chunkIndex: index,
          text,
          meta: {
            chunkSize,
            chunkOverlap,
            originalLength: sourceText.length,
          },
        })),
      });
    }
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      value: chunks, // Store as text array
      meta: {
        duration,
        chunkCount: chunks.length,
        chunkSize,
        chunkOverlap,
        sourceLength: sourceText.length,
        storedInTable: storeInChunksTable,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to chunk text',
    };
  }
}

'use server';

import prisma from '@/lib/db';
import { requireProjectAccess } from '@/lib/session';
import {
  writeFile,
  getDocumentSourcePath,
  getDocumentDir,
  deleteDir,
} from '@/lib/storage';
import { enqueueProcessDocument, getBoss, QUEUE_NAMES } from '@/lib/queue';
import { createProcessorRun, getProcessorColumns } from '@/lib/processors';
import { SourceType } from '@prisma/client';
import { z } from 'zod';

const createDocumentFromUrlSchema = z.object({
  url: z.string().url('Invalid URL'),
  title: z.string().min(1).optional(),
});

export async function createDocumentFromUpload(
  projectId: string,
  formData: FormData
) {
  await requireProjectAccess(projectId);
  
  const file = formData.get('file') as File;
  const title = formData.get('title') as string | undefined;
  
  if (!file) {
    return { error: 'No file provided' };
  }
  
  try {
    // Create document record
    const document = await prisma.document.create({
      data: {
        projectId,
        title: title || file.name,
        sourceType: SourceType.upload,
        mimeType: file.type,
        values: {},
      },
    });
    
    // Determine file extension
    const extension = file.name.split('.').pop() || 'bin';
    const filePath = getDocumentSourcePath(projectId, document.id, extension);
    
    // Save file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);
    
    // Update document with file path
    await prisma.document.update({
      where: { id: document.id },
      data: { filePath },
    });
    
    // Trigger processor jobs for all processor columns
    await triggerProcessorsForDocument(projectId, document.id);
    
    return { success: true, document: { ...document, filePath } };
  } catch (error) {
    console.error('Upload error:', error);
    return { error: 'Failed to upload document' };
  }
}

export async function createDocumentFromUrl(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId);
  
  const url = formData.get('url') as string;
  const title = formData.get('title') as string | undefined;
  
  const result = createDocumentFromUrlSchema.safeParse({ url, title });
  if (!result.success) {
    return { error: result.error.errors[0].message };
  }
  
  try {
    // Create document record
    const document = await prisma.document.create({
      data: {
        projectId,
        title: title || new URL(url).hostname,
        sourceType: SourceType.url,
        sourceUrl: url,
        values: {},
      },
    });
    
    // Save URL to file for reference
    const filePath = getDocumentSourcePath(projectId, document.id, 'url.txt');
    await writeFile(filePath, url);
    
    // Update document with file path
    await prisma.document.update({
      where: { id: document.id },
      data: { filePath },
    });
    
    // Trigger processor jobs for all processor columns
    await triggerProcessorsForDocument(projectId, document.id);
    
    return { success: true, document: { ...document, filePath } };
  } catch (error) {
    console.error('Create from URL error:', error);
    return { error: 'Failed to create document' };
  }
}

async function triggerProcessorsForDocument(projectId: string, documentId: string) {
  const processorColumns = await getProcessorColumns(projectId);
  
  for (const column of processorColumns) {
    const runId = await createProcessorRun(projectId, documentId, column.id);
    await enqueueProcessDocument({
      projectId,
      documentId,
      columnId: column.id,
      runId,
    });
  }
}

export async function getDocuments(projectId: string) {
  await requireProjectAccess(projectId);
  
  const documents = await prisma.document.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
  
  return documents;
}

export async function getDocument(projectId: string, documentId: string) {
  await requireProjectAccess(projectId);
  
  const document = await prisma.document.findFirst({
    where: { id: documentId, projectId },
  });
  
  if (!document) {
    return { error: 'Document not found' };
  }
  
  return { document };
}

export async function updateDocument(
  projectId: string,
  documentId: string,
  formData: FormData
) {
  await requireProjectAccess(projectId);
  
  const title = formData.get('title') as string | undefined;
  
  try {
    const document = await prisma.document.update({
      where: { id: documentId, projectId },
      data: { title },
    });
    
    return { success: true, document };
  } catch (error) {
    console.error('Update document error:', error);
    return { error: 'Failed to update document' };
  }
}

export async function updateDocumentValue(
  projectId: string,
  documentId: string,
  columnKey: string,
  value: unknown
) {
  await requireProjectAccess(projectId);
  
  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });
    
    if (!document) {
      return { error: 'Document not found' };
    }
    
    // Check if column exists and is manual
    const column = await prisma.column.findFirst({
      where: { projectId, key: columnKey },
    });
    
    if (!column) {
      return { error: 'Column not found' };
    }
    
    if (column.mode !== 'manual') {
      return { error: 'Cannot manually edit processor column values' };
    }
    
    const values = (document.values as Record<string, unknown>) || {};
    values[columnKey] = value;
    
    await prisma.document.update({
      where: { id: documentId },
      data: { values },
    });
    
    return { success: true };
  } catch (error) {
    console.error('Update document value error:', error);
    return { error: 'Failed to update value' };
  }
}

export async function deleteDocument(projectId: string, documentId: string) {
  await requireProjectAccess(projectId);

  try {
    await deleteDir(getDocumentDir(projectId, documentId));
  } catch (error) {
    console.error('Delete document storage error:', error);
    return { error: 'Failed to delete document files. Please try again.' };
  }

  try {
    await prisma.document.delete({
      where: { id: documentId, projectId },
    });

    return { success: true };
  } catch (error) {
    console.error('Delete document error:', error);
    return { error: 'Failed to delete document' };
  }
}

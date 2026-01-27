import prisma from "@/lib/db";
import { ColumnMode, ColumnType, ProcessorType } from "@prisma/client";
import { PDF_THUMBNAIL_COLUMN_KEY } from "@/lib/thumbnails";
import { createProcessorRun } from "@/lib/processors";

export async function ensurePdfThumbnailColumn(projectId: string) {
  const existing = await prisma.column.findUnique({
    where: {
      projectId_key: {
        projectId,
        key: PDF_THUMBNAIL_COLUMN_KEY,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const maxPosition = await prisma.column.aggregate({
    where: { projectId },
    _max: { position: true },
  });

  try {
    return await prisma.column.create({
      data: {
        projectId,
        key: PDF_THUMBNAIL_COLUMN_KEY,
        name: "Thumbnail",
        type: ColumnType.text,
        mode: ColumnMode.processor,
        processorType: ProcessorType.pdf_to_thumbnail_mupdf,
        hidden: true,
        position: (maxPosition._max.position || 0) + 1,
      },
    });
  } catch (error) {
    const fallback = await prisma.column.findUnique({
      where: {
        projectId_key: {
          projectId,
          key: PDF_THUMBNAIL_COLUMN_KEY,
        },
      },
    });

    if (fallback) {
      return fallback;
    }

    throw error;
  }
}

export async function enqueuePdfThumbnailRun(
  projectId: string,
  documentId: string,
) {
  const column = await ensurePdfThumbnailColumn(projectId);
  // createProcessorRun already enqueues the job to the unified queue
  const runId = await createProcessorRun(projectId, documentId, column.id);

  return { runId, columnId: column.id };
}

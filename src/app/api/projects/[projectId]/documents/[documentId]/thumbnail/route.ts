import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/session';
import prisma from '@/lib/db';
import { fileExists, getDocumentThumbnailPath, readFile } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; documentId: string } }
) {
  try {
    await requireProjectAccess(params.projectId);

    const document = await prisma.document.findFirst({
      where: {
        id: params.documentId,
        projectId: params.projectId,
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const thumbnailPath = getDocumentThumbnailPath(
      params.projectId,
      params.documentId
    );

    const exists = await fileExists(thumbnailPath);
    if (!exists) {
      return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
    }

    const fileBuffer = await readFile(thumbnailPath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Thumbnail fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load thumbnail';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

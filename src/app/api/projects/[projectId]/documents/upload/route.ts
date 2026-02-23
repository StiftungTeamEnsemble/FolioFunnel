import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/session";
import { writeFile, getDocumentSourcePath } from "@/lib/storage";
import { enqueuePdfThumbnailRun } from "@/lib/thumbnail-processing";
import prisma from "@/lib/db";
import { SourceType } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  try {
    const { user } = await requireProjectAccess(projectId);

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string | undefined;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Create document record
    const document = await prisma.document.create({
      data: {
        projectId: projectId,
        uploadedById: user.id,
        title: title || file.name,
        sourceType: SourceType.upload,
        mimeType: file.type,
        values: {},
      },
    });

    // Determine file extension
    const extension = file.name.split(".").pop() || "bin";
    const filePath = getDocumentSourcePath(
      projectId,
      document.id,
      extension,
    );

    // Save file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Update document with file path
    await prisma.document.update({
      where: { id: document.id },
      data: { filePath },
    });

    const isPdf =
      file.type === "application/pdf" || extension.toLowerCase() === "pdf";
    if (isPdf) {
      try {
        await enqueuePdfThumbnailRun(projectId, document.id);
      } catch (error) {
        console.error("Thumbnail enqueue error:", error);
      }
    }

    return NextResponse.json({
      success: true,
      document: { ...document, filePath },
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

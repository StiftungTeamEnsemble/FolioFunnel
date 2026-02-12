import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import { fileExists, readFile } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
  const { projectId, documentId } = await params;

  await requireProjectAccess(projectId);

  const document = await prisma.document.findFirst({
    where: { id: documentId, projectId },
    select: {
      title: true,
      mimeType: true,
      filePath: true,
      sourceType: true,
      sourceUrl: true,
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (document.sourceType === "url" && document.sourceUrl) {
    return NextResponse.redirect(document.sourceUrl, 302);
  }

  if (!document.filePath || !(await fileExists(document.filePath))) {
    return NextResponse.json(
      { error: "Document source file not found" },
      { status: 404 },
    );
  }

  const fileBuffer = await readFile(document.filePath);
  const fileBytes = new Uint8Array(fileBuffer);
  const contentType = document.mimeType || "application/octet-stream";

  return new NextResponse(fileBytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.title)}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

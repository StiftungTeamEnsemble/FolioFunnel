import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import { z } from "zod";

const updateValueSchema = z.object({
  columnKey: z.string().min(1),
  value: z.unknown(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
  const { projectId, documentId } = await params;
  try {
    await requireProjectAccess(projectId);
    const payload = updateValueSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!payload.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { columnKey, value } = payload.data;

    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId: projectId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const column = await prisma.column.findFirst({
      where: { projectId: projectId, key: columnKey },
    });

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 });
    }

    if (column.mode !== "manual") {
      return NextResponse.json(
        { error: "Cannot manually edit processor column values" },
        { status: 400 },
      );
    }

    const values = (document.values as Record<string, unknown>) || {};
    values[columnKey] = value;

    await prisma.document.update({
      where: { id: documentId },
      data: { values: values as any },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update document value error:", error);
    return NextResponse.json(
      { error: "Failed to update value" },
      { status: 500 },
    );
  }
}

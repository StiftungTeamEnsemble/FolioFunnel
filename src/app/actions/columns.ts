"use server";

import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import {
  MemberRole,
  ColumnType,
  ColumnMode,
  ProcessorType,
} from "@prisma/client";
import { z } from "zod";
import {
  isValidChatModel,
  isValidEmbeddingModel,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
} from "@/lib/models";

const createColumnSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(50)
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Key must be lowercase, start with a letter, and contain only letters, numbers, and underscores",
      ),
    name: z.string().min(1).max(100),
    type: z.enum(["text", "number", "text_array", "number_array"]),
    mode: z.enum(["manual", "processor"]),
    processorType: z
      .enum([
        "document_to_markdown",
        "document_to_metadata",
        "pdf_to_markdown_mupdf",
        "pdf_to_thumbnail_mupdf",
        "pdf_to_metadata",
        "url_to_markdown",
        "chunk_text",
        "create_embeddings",
        "ai_transform",
        "count_tokens",
      ])
      .nullable()
      .optional(),
    processorConfig: z.record(z.unknown()).optional(),
  })
  .refine((data) => data.mode === "manual" || data.processorType, {
    message: "Processor type is required when mode is processor",
    path: ["processorType"],
  });

export async function createColumn(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const key = formData.get("key") as string;
  const name = formData.get("name") as string;
  const type = formData.get("type") as ColumnType;
  const mode = formData.get("mode") as ColumnMode;
  const processorType = formData.get("processorType") as
    | ProcessorType
    | undefined;
  const processorConfigStr = formData.get("processorConfig") as
    | string
    | undefined;

  let processorConfig: Record<string, unknown> | undefined;
  if (processorConfigStr) {
    try {
      processorConfig = JSON.parse(processorConfigStr);

      // Validate and sanitize model in processor config
      if (processorConfig.model && typeof processorConfig.model === "string") {
        // For chat-based processors (ai_transform, count_tokens)
        if (
          processorType === "ai_transform" ||
          processorType === "count_tokens"
        ) {
          if (!isValidChatModel(processorConfig.model)) {
            processorConfig.model = DEFAULT_CHAT_MODEL;
          }
        }
        // For embedding processors
        if (processorType === "create_embeddings") {
          if (!isValidEmbeddingModel(processorConfig.model)) {
            processorConfig.model = DEFAULT_EMBEDDING_MODEL;
          }
        }
      }
    } catch {
      return { error: "Invalid processor config JSON" };
    }
  }

  const result = createColumnSchema.safeParse({
    key,
    name,
    type,
    mode,
    processorType: mode === "processor" ? processorType : undefined,
    processorConfig,
  });

  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  try {
    // Check if key already exists
    const existing = await prisma.column.findUnique({
      where: {
        projectId_key: {
          projectId,
          key,
        },
      },
    });

    if (existing) {
      return { error: "A column with this key already exists" };
    }

    // Get max position
    const maxPosition = await prisma.column.aggregate({
      where: { projectId },
      _max: { position: true },
    });

    const column = await prisma.column.create({
      data: {
        projectId,
        key,
        name,
        type: type as ColumnType,
        mode: mode as ColumnMode,
        processorType:
          mode === "processor" ? (processorType as ProcessorType) : null,
        processorConfig: processorConfig || null,
        position: (maxPosition._max.position || 0) + 1,
      },
    });

    return { success: true, column };
  } catch (error) {
    console.error("Create column error:", error);
    return { error: "Failed to create column" };
  }
}

export async function getColumns(projectId: string) {
  await requireProjectAccess(projectId);

  const columns = await prisma.column.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });

  return columns;
}

export async function updateColumn(
  projectId: string,
  columnId: string,
  formData: FormData,
) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const name = formData.get("name") as string | undefined;
  const processorType = formData.get("processorType") as
    | ProcessorType
    | undefined;
  const processorConfigStr = formData.get("processorConfig") as
    | string
    | undefined;

  let processorConfig: Record<string, unknown> | undefined;
  if (processorConfigStr) {
    try {
      processorConfig = JSON.parse(processorConfigStr);
    } catch {
      return { error: "Invalid processor config JSON" };
    }
  }

  try {
    const column = await prisma.column.findFirst({
      where: { id: columnId, projectId },
    });

    if (!column) {
      return { error: "Column not found" };
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (processorType && column.mode === "processor") {
      updateData.processorType = processorType;
    }
    if (processorConfig !== undefined) {
      updateData.processorConfig = processorConfig;
    }

    const updated = await prisma.column.update({
      where: { id: columnId },
      data: updateData,
    });

    return { success: true, column: updated };
  } catch (error) {
    console.error("Update column error:", error);
    return { error: "Failed to update column" };
  }
}

export async function deleteColumn(projectId: string, columnId: string) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  try {
    await prisma.column.delete({
      where: { id: columnId, projectId },
    });

    return { success: true };
  } catch (error) {
    console.error("Delete column error:", error);
    return { error: "Failed to delete column" };
  }
}

export async function reorderColumns(projectId: string, columnIds: string[]) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  try {
    await prisma.$transaction(
      columnIds.map((id, index) =>
        prisma.column.update({
          where: { id, projectId },
          data: { position: index },
        }),
      ),
    );

    return { success: true };
  } catch (error) {
    console.error("Reorder columns error:", error);
    return { error: "Failed to reorder columns" };
  }
}

export async function updateColumnVisibility(
  projectId: string,
  columnId: string,
  hidden: boolean,
) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  try {
    const column = await prisma.column.findFirst({
      where: { id: columnId, projectId },
    });

    if (!column) {
      return { error: "Column not found" };
    }

    const updated = await prisma.column.update({
      where: { id: columnId },
      data: { hidden },
    });

    return { success: true, column: updated };
  } catch (error) {
    console.error("Update column visibility error:", error);
    return { error: "Failed to update column visibility" };
  }
}

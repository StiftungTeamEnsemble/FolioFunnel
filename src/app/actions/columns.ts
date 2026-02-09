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

type AllowedValueChanges = {
  renamed: { from: string; to: string }[];
  deleted: string[];
};

const applyAllowedValueChanges = async (
  projectId: string,
  columnKey: string,
  changes: AllowedValueChanges,
) => {
  if (changes.renamed.length === 0 && changes.deleted.length === 0) {
    return;
  }

  const renameMap = new Map(
    changes.renamed.map((change) => [change.from, change.to]),
  );
  const deleteSet = new Set(changes.deleted);

  const documents = await prisma.document.findMany({
    where: { projectId },
    select: { id: true, values: true },
  });

  const updates = documents.flatMap((doc) => {
    const values = (doc.values as Record<string, unknown>) || {};
    const current = values[columnKey];
    if (!Array.isArray(current)) return [];

    let changed = false;
    const next = current.flatMap((item) => {
      if (typeof item !== "string") {
        return [item];
      }
      if (deleteSet.has(item)) {
        changed = true;
        return [];
      }
      if (renameMap.has(item)) {
        changed = true;
        return [renameMap.get(item)];
      }
      return [item];
    });

    if (!changed) return [];

    return prisma.document.update({
      where: { id: doc.id },
      data: { values: { ...values, [columnKey]: next } },
    });
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
};

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
        "text_array_split",
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
      if (processorConfig && processorConfig.model && typeof processorConfig.model === "string") {
        // For chat-based processors (ai_transform, count_tokens)
        if (
          processorType === "ai_transform" ||
          processorType === "count_tokens"
        ) {
          if (!isValidChatModel(processorConfig.model as string)) {
            processorConfig.model = DEFAULT_CHAT_MODEL;
          }
        }
        // For embedding processors
        if (processorType === "create_embeddings") {
          if (!isValidEmbeddingModel(processorConfig.model as string)) {
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
        processorConfig: processorConfig as any || undefined,
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
  const allowedValueChangesStr = formData.get("allowedValueChanges") as
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

  let allowedValueChanges: AllowedValueChanges | null = null;
  if (allowedValueChangesStr) {
    try {
      const parsed = JSON.parse(allowedValueChangesStr) as AllowedValueChanges;
      if (
        parsed &&
        Array.isArray(parsed.renamed) &&
        Array.isArray(parsed.deleted)
      ) {
        allowedValueChanges = {
          renamed: parsed.renamed
            .filter(
              (entry) =>
                entry &&
                typeof entry.from === "string" &&
                typeof entry.to === "string",
            )
            .map((entry) => ({ from: entry.from, to: entry.to })),
          deleted: parsed.deleted.filter(
            (entry) => typeof entry === "string",
          ),
        };
      }
    } catch {
      allowedValueChanges = null;
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

    if (
      allowedValueChanges &&
      column.mode === "manual" &&
      column.type === "text_array" &&
      processorConfig?.manualTextArrayRestrict === true
    ) {
      await applyAllowedValueChanges(projectId, column.key, allowedValueChanges);
    }

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

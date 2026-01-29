"use server";

import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import { MemberRole } from "@prisma/client";
import { z } from "zod";
import type { FilterGroup } from "@/lib/document-filters";

const promptTemplateSchema = z.object({
  title: z.string().min(1).max(120),
  promptTemplate: z.string().min(1),
  filters: z.array(z.unknown()).optional(),
});

export async function createPromptTemplateAction({
  projectId,
  title,
  promptTemplate,
  filters,
}: {
  projectId: string;
  title: string;
  promptTemplate: string;
  filters: FilterGroup[];
}) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const result = promptTemplateSchema.safeParse({
    title,
    promptTemplate,
    filters,
  });

  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  try {
    const template = await prisma.promptTemplate.create({
      data: {
        projectId,
        title: title.trim(),
        promptTemplate,
        filters,
      },
    });

    return { template };
  } catch (error) {
    console.error("Create prompt template error:", error);
    return { error: "Failed to create prompt template." };
  }
}

export async function updatePromptTemplateAction({
  projectId,
  promptTemplateId,
  title,
  promptTemplate,
  filters,
}: {
  projectId: string;
  promptTemplateId: string;
  title: string;
  promptTemplate: string;
  filters: FilterGroup[];
}) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const result = promptTemplateSchema.safeParse({
    title,
    promptTemplate,
    filters,
  });

  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  const existing = await prisma.promptTemplate.findFirst({
    where: { id: promptTemplateId, projectId },
  });

  if (!existing) {
    return { error: "Prompt template not found." };
  }

  try {
    const template = await prisma.promptTemplate.update({
      where: { id: promptTemplateId },
      data: {
        title: title.trim(),
        promptTemplate,
        filters,
      },
    });

    return { template };
  } catch (error) {
    console.error("Update prompt template error:", error);
    return { error: "Failed to update prompt template." };
  }
}

export async function deletePromptTemplateAction({
  projectId,
  promptTemplateId,
}: {
  projectId: string;
  promptTemplateId: string;
}) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const existing = await prisma.promptTemplate.findFirst({
    where: { id: promptTemplateId, projectId },
  });

  if (!existing) {
    return { error: "Prompt template not found." };
  }

  try {
    await prisma.promptTemplate.delete({
      where: { id: promptTemplateId },
    });

    return { success: true };
  } catch (error) {
    console.error("Delete prompt template error:", error);
    return { error: "Failed to delete prompt template." };
  }
}

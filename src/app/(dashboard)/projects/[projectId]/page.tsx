import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/session";
import prisma from "@/lib/db";
import { ProjectPromptClient } from "./client";

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

const isPromptRunHidden = (meta: unknown) => {
  if (!meta || typeof meta !== "object") return false;
  return Boolean((meta as Record<string, unknown>).hiddenAt);
};

export default async function ProjectPromptPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  try {
    await requireProjectAccess(projectId);
  } catch {
    notFound();
  }

  const [project, columns, promptRuns, promptTemplates] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
      }),
      prisma.column.findMany({
        where: { projectId: projectId },
        orderBy: { position: "asc" },
      }),
      prisma.run.findMany({
        where: {
          projectId: projectId,
          type: "prompt",
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.promptTemplate.findMany({
        where: { projectId: projectId },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  if (!project) {
    notFound();
  }

  return (
    <ProjectPromptClient
      project={project}
      columns={columns}
      promptRuns={promptRuns.filter((run) => !isPromptRunHidden(run.meta))}
      promptTemplates={promptTemplates}
    />
  );
}

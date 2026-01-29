import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/session";
import prisma from "@/lib/db";
import { ProjectPromptClient } from "./client";

interface ProjectPageProps {
  params: { projectId: string };
}

export default async function ProjectPromptPage({ params }: ProjectPageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  try {
    await requireProjectAccess(params.projectId);
  } catch {
    notFound();
  }

  const [project, documents, columns, promptRuns, promptTemplates] =
    await Promise.all([
      prisma.project.findUnique({
        where: { id: params.projectId },
      }),
      prisma.document.findMany({
        where: { projectId: params.projectId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.column.findMany({
        where: { projectId: params.projectId },
        orderBy: { position: "asc" },
      }),
      prisma.run.findMany({
        where: {
          projectId: params.projectId,
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
        where: { projectId: params.projectId },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  if (!project) {
    notFound();
  }

  return (
    <ProjectPromptClient
      project={project}
      initialDocuments={documents}
      columns={columns}
      promptRuns={promptRuns}
      promptTemplates={promptTemplates}
    />
  );
}

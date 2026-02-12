import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/session";
import prisma from "@/lib/db";
import { ProjectDocumentsClient } from "./client";

interface ProjectPageProps {
  params: { projectId: string };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  try {
    await requireProjectAccess(params.projectId);
  } catch {
    notFound();
  }

  const [project, columns] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.projectId },
    }),
    prisma.column.findMany({
      where: { projectId: params.projectId },
      orderBy: { position: "asc" },
    }),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <ProjectDocumentsClient
      project={project}
      initialDocuments={[]}
      initialColumns={columns}
    />
  );
}

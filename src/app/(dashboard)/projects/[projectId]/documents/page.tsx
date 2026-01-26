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

  const [project, documents, columns] = await Promise.all([
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
  ]);

  if (!project) {
    notFound();
  }

  // Get latest processor runs for each document/column combination
  const latestRuns = await prisma.$queryRaw<
    Array<{
      documentId: string;
      columnKey: string;
      status: string;
      error: string | null;
    }>
  >`
    SELECT DISTINCT ON (pr.document_id, c.key)
      pr.document_id as "documentId",
      c.key as "columnKey",
      pr.status,
      pr.error
    FROM processor_runs pr
    JOIN columns c ON c.id = pr.column_id
    WHERE pr.project_id = ${params.projectId}::uuid
    ORDER BY pr.document_id, c.key, pr.created_at DESC
  `;

  // Attach runs to documents
  const documentsWithRuns = documents.map((doc) => ({
    ...doc,
    latestRuns: latestRuns
      .filter((r) => r.documentId === doc.id)
      .reduce(
        (acc, r) => ({
          ...acc,
          [r.columnKey]: { status: r.status, error: r.error },
        }),
        {} as Record<string, { status: string; error: string | null }>,
      ),
  }));

  return (
    <ProjectDocumentsClient
      project={project}
      initialDocuments={documentsWithRuns}
      initialColumns={columns}
    />
  );
}

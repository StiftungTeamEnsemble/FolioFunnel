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
    SELECT DISTINCT ON (r.document_id, c.key)
      r.document_id as "documentId",
      c.key as "columnKey",
      r.status::text as status,
      r.error
    FROM runs r
    JOIN columns c ON c.id = r.column_id
    WHERE r.project_id = ${params.projectId}::uuid
      AND r.type = 'processor'
    ORDER BY r.document_id, c.key, r.created_at DESC
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

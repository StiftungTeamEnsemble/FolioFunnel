import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { MemberRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/session";
import prisma from "@/lib/db";
import { ProjectEditClient } from "./client";

interface ProjectEditPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectEditPage({
  params,
}: ProjectEditPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  let access;
  try {
    access = await requireProjectAccess(projectId, [
      MemberRole.owner,
      MemberRole.admin,
    ]);
  } catch {
    notFound();
  }

  const [project, members, pendingInvites] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
    }),
    prisma.projectMembership.findMany({
      where: { projectId: projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.projectInvite.findMany({
      where: {
        projectId: projectId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <ProjectEditClient
      project={project}
      members={members}
      pendingInvites={pendingInvites}
      currentUserId={access.user.id}
    />
  );
}

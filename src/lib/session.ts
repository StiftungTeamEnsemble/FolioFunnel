import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { MemberRole } from "@prisma/client";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function getUserProjectMembership(
  userId: string,
  projectId: string,
) {
  return prisma.projectMembership.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });
}

export async function requireProjectAccess(
  projectId: string,
  requiredRoles?: MemberRole[],
) {
  const user = await requireAuth();

  const membership = await getUserProjectMembership(user.id, projectId);

  if (!membership) {
    throw new Error("Access denied: Not a member of this project");
  }

  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    throw new Error(
      `Access denied: Requires one of these roles: ${requiredRoles.join(", ")}`,
    );
  }

  return { user, membership };
}

export async function getUserProjects(userId: string) {
  const memberships = await prisma.projectMembership.findMany({
    where: { userId },
    include: {
      project: true,
    },
    orderBy: {
      project: {
        updatedAt: "desc",
      },
    },
  });

  return memberships.map((m) => ({
    ...m.project,
    role: m.role,
  }));
}

"use server";

import prisma from "@/lib/db";
import {
  requireAuth,
  getUserProjects,
  requireProjectAccess,
} from "@/lib/session";
import { MemberRole } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { getProjectDir, deleteDir } from "@/lib/storage";

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
});

const parseTags = (value?: string | null) => {
  if (!value) return [];
  const tags = value
    .split(/[\n,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return Array.from(new Set(tags));
};

export async function createProject(formData: FormData) {
  const user = await requireAuth();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string | undefined;

  const result = createProjectSchema.safeParse({ name, description });
  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      // Create project
      const project = await tx.project.create({
        data: {
          name,
          description: description || null,
          createdById: user.id,
        },
      });

      // Add creator as owner
      await tx.projectMembership.create({
        data: {
          userId: user.id,
          projectId: project.id,
          role: MemberRole.owner,
        },
      });

      return project;
    });

    return { success: true, project };
  } catch (error) {
    console.error("Create project error:", error);
    return { error: "Failed to create project" };
  }
}

export async function getProjects() {
  const user = await requireAuth();
  return getUserProjects(user.id);
}

export async function getProject(projectId: string) {
  await requireProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      _count: {
        select: {
          documents: true,
          memberships: true,
        },
      },
    },
  });

  return project;
}

export async function updateProject(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const name = formData.get("name") as string;
  const description = formData.get("description") as string | undefined;
  const resultTagsInput = formData.get("resultTags") as string | undefined;
  const resultTags = parseTags(resultTagsInput);

  try {
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        name,
        description: description || null,
        resultTags,
      },
    });

    return { success: true, project };
  } catch (error) {
    console.error("Update project error:", error);
    return { error: "Failed to update project" };
  }
}

export async function deleteProject(projectId: string) {
  await requireProjectAccess(projectId, [MemberRole.owner]);

  try {
    // Delete project from database
    await prisma.project.delete({
      where: { id: projectId },
    });

    // Delete project folder from file system
    const projectDir = getProjectDir(projectId);
    await deleteDir(projectDir);

    return { success: true };
  } catch (error) {
    console.error("Delete project error:", error);
    return { error: "Failed to delete project" };
  }
}

// Invitations
const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"]),
});

const addMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"]),
});

export async function addProjectMember(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const email = formData.get("email") as string;
  const role = formData.get("role") as "admin" | "member";

  const result = addMemberSchema.safeParse({ email, role });
  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // User doesn't exist yet - create an invite instead
      const existingInvite = await prisma.projectInvite.findFirst({
        where: {
          projectId,
          email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvite) {
        return { error: "An invite is already pending for this email" };
      }

      const token = uuid();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const invite = await prisma.projectInvite.create({
        data: {
          projectId,
          email,
          role: role as MemberRole,
          token,
          expiresAt,
        },
      });

      return { success: true, invite, inviteUrl: `/invite/${token}` };
    }

    const existingMembership = await prisma.projectMembership.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId,
        },
      },
    });

    if (existingMembership) {
      return { error: "User is already a member of this project" };
    }

    const membership = await prisma.projectMembership.create({
      data: {
        userId: user.id,
        projectId,
        role: role as MemberRole,
      },
    });

    await prisma.projectInvite.deleteMany({
      where: {
        projectId,
        email,
        acceptedAt: null,
      },
    });

    return { success: true, membership };
  } catch (error) {
    console.error("Add member error:", error);
    return { error: "Failed to add project member" };
  }
}

export async function inviteToProject(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const email = formData.get("email") as string;
  const role = formData.get("role") as "admin" | "member";

  const result = inviteSchema.safeParse({ email, role });
  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  try {
    // Check if user is already a member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: existingUser.id,
            projectId,
          },
        },
      });

      if (existingMembership) {
        return { error: "User is already a member of this project" };
      }
    }

    // Check for existing pending invite
    const existingInvite = await prisma.projectInvite.findFirst({
      where: {
        projectId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      return { error: "An invite is already pending for this email" };
    }

    // Create invite
    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const invite = await prisma.projectInvite.create({
      data: {
        projectId,
        email,
        role: role as MemberRole,
        token,
        expiresAt,
      },
    });

    // In production, send email here
    // For now, return the invite token
    return { success: true, invite, inviteUrl: `/invite/${token}` };
  } catch (error) {
    console.error("Invite error:", error);
    return { error: "Failed to create invite" };
  }
}

export async function acceptInvite(token: string) {
  const user = await requireAuth();

  try {
    const invite = await prisma.projectInvite.findUnique({
      where: { token },
      include: { project: true },
    });

    if (!invite) {
      return { error: "Invalid invite" };
    }

    if (invite.acceptedAt) {
      return { error: "Invite has already been accepted" };
    }

    if (invite.expiresAt < new Date()) {
      return { error: "Invite has expired" };
    }

    // Check if invitee email matches
    const inviteeUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (inviteeUser?.email !== invite.email) {
      return { error: "This invite was sent to a different email address" };
    }

    // Check if already a member
    const existingMembership = await prisma.projectMembership.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: invite.projectId,
        },
      },
    });

    if (existingMembership) {
      return {
        error: "You are already a member of this project",
        projectId: invite.projectId,
      };
    }

    // Accept invite
    await prisma.$transaction([
      prisma.projectMembership.create({
        data: {
          userId: user.id,
          projectId: invite.projectId,
          role: invite.role,
        },
      }),
      prisma.projectInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      projectId: invite.projectId,
      projectName: invite.project.name,
    };
  } catch (error) {
    console.error("Accept invite error:", error);
    return { error: "Failed to accept invite" };
  }
}

export async function getProjectMembers(projectId: string) {
  await requireProjectAccess(projectId);

  const members = await prisma.projectMembership.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return members;
}

export async function getPendingInvites(projectId: string) {
  await requireProjectAccess(projectId, [MemberRole.owner, MemberRole.admin]);

  const invites = await prisma.projectInvite.findMany({
    where: {
      projectId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  return invites;
}

export async function removeMember(projectId: string, userId: string) {
  const { membership } = await requireProjectAccess(projectId, [
    MemberRole.owner,
    MemberRole.admin,
  ]);

  // Cannot remove yourself if you're the owner
  const targetMembership = await prisma.projectMembership.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!targetMembership) {
    return { error: "User is not a member of this project" };
  }

  if (targetMembership.role === MemberRole.owner) {
    return { error: "Cannot remove the project owner" };
  }

  // Admins cannot remove other admins
  if (
    membership.role === MemberRole.admin &&
    targetMembership.role === MemberRole.admin
  ) {
    return { error: "Admins cannot remove other admins" };
  }

  try {
    await prisma.projectMembership.delete({
      where: { id: targetMembership.id },
    });

    return { success: true };
  } catch (error) {
    console.error("Remove member error:", error);
    return { error: "Failed to remove member" };
  }
}

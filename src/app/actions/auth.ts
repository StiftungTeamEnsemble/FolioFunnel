"use server";

import { hash } from "bcryptjs";
import prisma from "@/lib/db";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").optional(),
});

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string | undefined;

  // Validate input
  const result = signUpSchema.safeParse({ email, password, name });
  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { error: "A user with this email already exists" };
    }

    // Hash password
    const passwordHash = await hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
      },
    });

    // Check for pending invites and accept them
    const pendingInvites = await prisma.projectInvite.findMany({
      where: {
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    for (const invite of pendingInvites) {
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
    }

    return { success: true };
  } catch (error) {
    console.error("Sign up error:", error);
    return { error: "Failed to create account" };
  }
}

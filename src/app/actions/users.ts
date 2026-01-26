"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/session";

const updateProfileSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().email("Enter a valid email address"),
});

export async function updateProfile(formData: FormData) {
  const user = await requireAuth();
  const nameValue = (formData.get("name") as string | null) ?? "";
  const email = (formData.get("email") as string | null) ?? "";

  const result = updateProfileSchema.safeParse({
    name: nameValue,
    email,
  });

  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  const cleanedName = result.data.name?.trim();

  const existingUser = await prisma.user.findUnique({
    where: { email: result.data.email },
    select: { id: true },
  });

  if (existingUser && existingUser.id !== user.id) {
    return { error: "That email is already in use." };
  }

  let updatedUser;

  try {
    updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: cleanedName ? cleanedName : null,
        email: result.data.email,
      },
      select: { name: true, email: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "That email is already in use." };
    }

    throw error;
  }

  return { success: true, user: updatedUser };
}

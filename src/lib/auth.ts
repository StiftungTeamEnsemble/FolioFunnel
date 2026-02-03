import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.error("[Auth] Missing credentials");
            throw new Error("EMAIL_PASSWORD_REQUIRED");
          }

          console.log(`[Auth] Attempting login for: ${credentials.email}`);

          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user) {
            console.error(`[Auth] User not found: ${credentials.email}`);
            throw new Error("USER_NOT_FOUND");
          }

          if (!user.passwordHash) {
            console.error(`[Auth] User has no password hash: ${credentials.email}`);
            throw new Error("NO_PASSWORD_HASH");
          }

          const isPasswordValid = await compare(
            credentials.password,
            user.passwordHash,
          );

          if (!isPasswordValid) {
            console.error(`[Auth] Invalid password for: ${credentials.email}`);
            throw new Error("INVALID_PASSWORD");
          }

          console.log(`[Auth] Login successful for: ${credentials.email}`);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error) {
          console.error("[Auth] Authorization error:", error);
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        try {
          const currentUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { name: true, email: true },
          });
          if (currentUser) {
            session.user.name = currentUser.name;
            session.user.email = currentUser.email;
          }
        } catch (error) {
          console.error("[Auth] Error fetching user in session:", error);
        }
      }
      return session;
    },
  },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects } from "@/lib/session";
import prisma from "@/lib/db";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const projects = await getUserProjects(session.user.id);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  return (
    <div className="app-layout">
      <Sidebar projects={projects} user={user} />
      <main className="app-layout__main">{children}</main>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserProjects } from '@/lib/session';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  const projects = await getUserProjects(session.user.id);

  return (
    <div className="app-layout">
      <Sidebar projects={projects} />
      <main className="app-layout__main">{children}</main>
    </div>
  );
}

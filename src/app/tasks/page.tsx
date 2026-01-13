import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { RunStatus } from '@prisma/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { TaskList } from '@/components/tasks/TaskList';
import { ClearPendingTasksButton } from '@/components/tasks/ClearPendingTasksButton';
import '@/styles/pages/tasks.css';

async function getProjects(userId: string) {
  const memberships = await prisma.projectMembership.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { project: { updatedAt: 'desc' } },
  });

  return memberships.map((m) => ({
    id: m.project.id,
    name: m.project.name,
    role: m.role,
  }));
}

async function getPendingTasks() {
  const tasks = await prisma.processorRun.findMany({
    where: {
      status: { in: [RunStatus.queued, RunStatus.running] },
    },
    include: {
      document: {
        select: { id: true, title: true },
      },
      column: {
        select: { id: true, name: true, key: true },
      },
      project: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return tasks;
}

async function getRecentTasks() {
  const tasks = await prisma.processorRun.findMany({
    where: {
      status: { in: [RunStatus.success, RunStatus.error] },
    },
    include: {
      document: {
        select: { id: true, title: true },
      },
      column: {
        select: { id: true, name: true, key: true },
      },
      project: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return tasks;
}

export default async function TasksPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const [projects, pendingTasks, recentTasks] = await Promise.all([
    getProjects(session.user.id),
    getPendingTasks(),
    getRecentTasks(),
  ]);

  return (
    <div className="app-layout">
      <Sidebar
        projects={projects}
        user={{
          name: session.user.name,
          email: session.user.email,
        }}
      />
      <main className="main-content">
        <div className="tasks-page">
          <header className="tasks-page__header">
            <h1 className="tasks-page__title">Task Queue</h1>
          </header>

          <section className="tasks-page__section">
            <div className="tasks-page__section-header">
              <h2 className="tasks-page__section-title">
                Pending Tasks ({pendingTasks.length})
              </h2>
              {pendingTasks.length > 0 && <ClearPendingTasksButton />}
            </div>
            <TaskList tasks={pendingTasks} emptyMessage="No pending tasks" />
          </section>

          <section className="tasks-page__section">
            <h2 className="tasks-page__section-title">
              Recent Tasks ({recentTasks.length})
            </h2>
            <TaskList tasks={recentTasks} emptyMessage="No recent tasks" />
          </section>
        </div>
      </main>
    </div>
  );
}

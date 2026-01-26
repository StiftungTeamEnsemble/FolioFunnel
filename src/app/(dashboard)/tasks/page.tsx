import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { Button } from "@/components/ui";
import { ClearPendingTasksButton } from "@/components/tasks/ClearPendingTasksButton";
import "@/styles/components/tasks.css";

const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  error: "Error",
};

const statusBadgeClass: Record<string, string> = {
  queued: "badge badge--default badge--sm",
  running: "badge badge--warning badge--sm",
  success: "badge badge--success badge--sm",
  error: "badge badge--error badge--sm",
};

const statusDotClass: Record<string, string> = {
  queued: "tasks-list__status-dot tasks-list__status-dot--queued",
  running: "tasks-list__status-dot tasks-list__status-dot--running",
  success: "tasks-list__status-dot tasks-list__status-dot--success",
  error: "tasks-list__status-dot tasks-list__status-dot--error",
};

export default async function TasksPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const runs = await prisma.processorRun.findMany({
    where: {
      project: {
        memberships: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      document: {
        select: {
          id: true,
          title: true,
        },
      },
      column: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Tasks</h1>
          <p className="page__subtitle">
            Track recent processing runs across your projects.
          </p>
        </div>
        <div className="page__actions">
          <ClearPendingTasksButton />
          <Button asChild variant="secondary">
            <Link href="/projects">View Projects</Link>
          </Button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none">
            <rect
              x="10"
              y="14"
              width="44"
              height="36"
              rx="6"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M20 32h24"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M20 24h16"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <h2 className="empty-state__title">No tasks yet</h2>
          <p className="empty-state__description">
            Start running processors in a project to see task activity here.
          </p>
          <Button asChild>
            <Link href="/projects">Go to Projects</Link>
          </Button>
        </div>
      ) : (
        <div className="section">
          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Recent Runs</h2>
                <p className="card__subtitle">
                  Latest automated and manual processing activity.
                </p>
              </div>
            </div>
            <div className="card__body card__body--compact">
              <ul className="tasks-list">
                {runs.map((run) => {
                  const status = run.status.toLowerCase();
                  return (
                    <li key={run.id} className="tasks-list__item">
                      <div className="tasks-list__details">
                        <span className={statusDotClass[status]} />
                        <div>
                          <div className="tasks-list__title">
                            {run.column.name} on {run.document.title}
                          </div>
                          <div className="tasks-list__meta">
                            <Link
                              href={`/projects/${run.project.id}`}
                              className="tasks-list__link"
                            >
                              {run.project.name}
                            </Link>
                            <span className="tasks-list__separator">•</span>
                            <span className="tasks-list__time">
                              {new Date(run.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {run.error && (
                            <div className="tasks-list__error">{run.error}</div>
                          )}
                        </div>
                      </div>
                      <span className={statusBadgeClass[status]}>
                        {statusLabels[status]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

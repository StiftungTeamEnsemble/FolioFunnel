import Link from "next/link";
import { formatDateTime } from "@/lib/date-time";
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

// Unified task type for display
type UnifiedTask = {
  id: string;
  type: "processor" | "prompt";
  status: string;
  createdAt: Date;
  projectId: string;
  projectName: string;
  title: string;
  subtitle?: string;
  error?: string | null;
};

export default async function TasksPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Fetch all runs (both processor and prompt) from unified table
  const runs = await prisma.run.findMany({
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
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  // Convert runs to unified task format
  const allTasks: UnifiedTask[] = runs.map((run) => {
    if (run.type === "processor") {
      return {
        id: run.id,
        type: "processor" as const,
        status: run.status,
        createdAt: run.createdAt,
        projectId: run.project.id,
        projectName: run.project.name,
        title: run.column && run.document 
          ? `${run.column.name} on ${run.document.title}`
          : "Processor Run",
        error: run.error,
      };
    } else {
      return {
        id: run.id,
        type: "prompt" as const,
        status: run.status,
        createdAt: run.createdAt,
        projectId: run.project.id,
        projectName: run.project.name,
        title: `Prompt Run${run.model ? ` (${run.model})` : ""}`,
        subtitle: run.createdBy 
          ? (run.createdBy.name || run.createdBy.email || "Unknown user")
          : undefined,
        error: run.error,
      };
    }
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Tasks</h1>
          <p className="page__subtitle">
            Track recent processing runs and prompt executions across your projects.
          </p>
        </div>
        <div className="page__actions">
          <ClearPendingTasksButton />
          <Button asChild variant="secondary">
            <Link href="/projects">View Projects</Link>
          </Button>
        </div>
      </div>

      {allTasks.length === 0 ? (
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
            Start running processors or prompts in a project to see task activity here.
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
                <h2 className="card__title">Recent Activity</h2>
                <p className="card__subtitle">
                  Latest processor runs and prompt executions from the unified queue.
                </p>
              </div>
            </div>
            <div className="card__body card__body--compact">
              <ul className="tasks-list">
                {allTasks.map((task) => {
                  const status = task.status.toLowerCase();
                  const taskLink = task.type === "prompt" 
                    ? `/projects/${task.projectId}/prompts/${task.id}`
                    : `/projects/${task.projectId}`;
                  
                  return (
                    <li key={`${task.type}-${task.id}`} className="tasks-list__item">
                      <div className="tasks-list__details">
                        <span className={statusDotClass[status]} />
                        <div>
                          <div className="tasks-list__title">
                            <Link href={taskLink} className="tasks-list__link">
                              {task.title}
                            </Link>
                            <span className="badge badge--xs" style={{ marginLeft: "8px" }}>
                              {task.type === "processor" ? "Processor" : "Prompt"}
                            </span>
                          </div>
                          <div className="tasks-list__meta">
                            <Link
                              href={`/projects/${task.projectId}`}
                              className="tasks-list__link"
                            >
                              {task.projectName}
                            </Link>
                            {task.subtitle && (
                              <>
                                <span className="tasks-list__separator">•</span>
                                <span>{task.subtitle}</span>
                              </>
                            )}
                            <span className="tasks-list__separator">•</span>
                            <span className="tasks-list__time">
                              {formatDateTime(task.createdAt)}
                            </span>
                          </div>
                          {task.error && (
                            <div className="tasks-list__error">{task.error}</div>
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

import Link from "next/link";
import { formatDateTime } from "@/lib/date-time";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { Button, MetaLine, MetaSeparator, Pagination } from "@/components/ui";
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

type TaskFilterType = "all" | "queued" | "running" | "success" | "error";

type TasksPageProps = {
  searchParams?: {
    page?: string;
    status?: string;
  };
};

const taskFilters: { label: string; value: TaskFilterType }[] = [
  { label: "All tasks", value: "all" },
  { label: "Queued", value: "queued" },
  { label: "Running", value: "running" },
  { label: "Success", value: "success" },
  { label: "Error", value: "error" },
];

const PAGE_SIZE = 50;

function resolveFilterType(value?: string): TaskFilterType {
  if (
    value === "queued" ||
    value === "running" ||
    value === "success" ||
    value === "error"
  ) {
    return value;
  }
  return "all";
}

function resolvePageNumber(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const currentFilter = resolveFilterType(searchParams?.status);
  const requestedPage = resolvePageNumber(searchParams?.page);

  const baseWhere = {
    project: {
      memberships: {
        some: {
          userId: session.user.id,
        },
      },
    },
  };

  const where =
    currentFilter === "all"
      ? baseWhere
      : { ...baseWhere, status: currentFilter };

  const totalTaskCount = await prisma.run.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalTaskCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const skip = (currentPage - 1) * PAGE_SIZE;

  const buildTasksUrl = (page: number, filter: TaskFilterType) => {
    const params = new URLSearchParams();
    if (page > 1) {
      params.set("page", String(page));
    }
    if (filter !== "all") {
      params.set("status", filter);
    }
    const query = params.toString();
    return query ? `/tasks?${query}` : "/tasks";
  };

  // Fetch all runs (both processor and prompt) from unified table
  const runs = await prisma.run.findMany({
    where,
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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE,
    skip,
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
        title:
          run.column && run.document
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
          ? run.createdBy.name || run.createdBy.email || "Unknown user"
          : undefined,
        error: run.error,
      };
    }
  });

  const openTaskCount = await prisma.run.count({
    where: {
      status: {
        in: ["queued", "running"],
      },
      project: {
        memberships: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Tasks</h1>
          <p className="page__subtitle">
            Track recent processing runs and prompt executions across your
            projects.
          </p>
        </div>
        <div className="page__actions">
          <ClearPendingTasksButton />
          <Button asChild variant="secondary">
            <Link href="/projects">View Projects</Link>
          </Button>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Recent Activity</h2>
              <p className="card__subtitle">
                Latest processor runs and prompts.
              </p>
              <p className="card__subtitle">
                Open tasks in queue: {openTaskCount}
              </p>
            </div>
            <div className="tasks-filters">
              <span className="tasks-filters__label">Filter:</span>
              <div className="tasks-filters__options">
                {taskFilters.map((filter) => {
                  const isActive = currentFilter === filter.value;
                  return (
                    <Link
                      key={filter.value}
                      href={buildTasksUrl(1, filter.value)}
                      className={`tasks-filter ${
                        isActive ? "tasks-filter--active" : ""
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {filter.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="card__body card__body--compact">
            {allTasks.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <svg
                  className="empty-state__icon"
                  viewBox="0 0 64 64"
                  fill="none"
                >
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
                <h2 className="empty-state__title">
                  {currentFilter === "all"
                    ? "No tasks yet"
                    : "No tasks match this filter"}
                </h2>
                <p className="empty-state__description">
                  {currentFilter === "all"
                    ? "Start running processors or prompts in a project to see task activity here."
                    : "Try a different status filter or clear the filter to see more activity."}
                </p>
                <Button asChild>
                  <Link href={buildTasksUrl(1, "all")}>Clear filter</Link>
                </Button>
              </div>
            ) : (
              <ul className="tasks-list">
                {allTasks.map((task) => {
                  const status = task.status.toLowerCase();
                  const taskLink =
                    task.type === "prompt"
                      ? `/projects/${task.projectId}/prompts/${task.id}`
                      : `/projects/${task.projectId}`;

                  return (
                    <li
                      key={`${task.type}-${task.id}`}
                      className="tasks-list__item"
                    >
                      <div className="tasks-list__details">
                        <span className={statusDotClass[status]} />
                        <div>
                          <div className="tasks-list__title">
                            <Link href={taskLink} className="tasks-list__link">
                              {task.title}
                            </Link>
                            <span
                              className="badge badge--xs"
                              style={{ marginLeft: "8px" }}
                            >
                              {task.type === "processor"
                                ? "Processor"
                                : "Prompt"}
                            </span>
                          </div>
                          <MetaLine>
                            <Link
                              href={`/projects/${task.projectId}`}
                              className="tasks-list__link"
                            >
                              {task.projectName}
                            </Link>
                            {task.subtitle && (
                              <>
                                <MetaSeparator />
                                <span>{task.subtitle}</span>
                              </>
                            )}
                            <MetaSeparator />
                            <span className="tasks-list__time">
                              {formatDateTime(task.createdAt)}
                            </span>
                          </MetaLine>
                          {task.error && (
                            <div className="tasks-list__error">
                              {task.error}
                            </div>
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
            )}
          </div>
          <div className="card__footer">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              previousHref={buildTasksUrl(currentPage - 1, currentFilter)}
              nextHref={buildTasksUrl(currentPage + 1, currentFilter)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

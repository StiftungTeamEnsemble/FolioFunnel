import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects } from "@/lib/session";
import { formatDateTime } from "@/lib/date-time";
import { Button } from "@/components/ui";
import { DeleteProjectButton } from "@/components/projects/DeleteProjectButton";

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const projects = await getUserProjects(session.user.id);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Projects</h1>
          <p className="page__subtitle">
            Manage your document processing projects
          </p>
        </div>
        <div className="page__actions">
          <Button asChild>
            <Link href="/projects/new">New Project</Link>
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none">
            <rect
              x="8"
              y="16"
              width="48"
              height="40"
              rx="4"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path d="M8 28h48" stroke="currentColor" strokeWidth="3" />
            <path
              d="M24 8v8M40 8v8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <h2 className="empty-state__title">No projects yet</h2>
          <p className="empty-state__description">
            Create your first project to start processing documents and building
            knowledge tables.
          </p>
          <Button asChild>
            <Link href="/projects/new">Create Project</Link>
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              style={{ textDecoration: "none" }}
            >
              <div className="card card--clickable">
                <div className="card__body">
                  <h3 className="card__title">{project.name}</h3>
                  {project.description && (
                    <p className="card__subtitle">{project.description}</p>
                  )}
                </div>
                <div className="card__footer">
                  <span
                    className={`badge badge--${project.role === "owner" ? "primary" : "default"}`}
                  >
                    {project.role}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--color-gray-500)",
                      }}
                    >
                      {formatDateTime(project.updatedAt)}
                    </span>
                    <DeleteProjectButton
                      projectId={project.id}
                      projectName={project.name}
                      isOwner={project.role === "owner"}
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

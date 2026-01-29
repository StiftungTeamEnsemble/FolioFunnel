import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/session";
import prisma from "@/lib/db";
import { Button } from "@/components/ui";

interface PromptRunPageProps {
  params: { projectId: string; promptId: string };
}

export default async function PromptRunPage({ params }: PromptRunPageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  try {
    await requireProjectAccess(params.projectId);
  } catch {
    notFound();
  }

  const promptRun = await prisma.run.findFirst({
    where: { 
      id: params.promptId, 
      projectId: params.projectId,
      type: "prompt",
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      project: { select: { id: true, name: true } },
    },
  });

  if (!promptRun) {
    notFound();
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Prompt Run</h1>
          <p className="page__subtitle">{promptRun.project.name}</p>
        </div>
        <div className="page__actions">
          <Button variant="secondary" asChild>
            <Link href={`/projects/${promptRun.project.id}`}>
              Back to Project
            </Link>
          </Button>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Summary</h3>
        </div>
        <div className="card">
          <div className="card__body">
            <p>
              <strong>Model:</strong> {promptRun.model}
            </p>
            <p>
              <strong>Status:</strong> {promptRun.status}
            </p>
            <p>
              <strong>Author:</strong>{" "}
              {promptRun.createdBy.name ||
                promptRun.createdBy.email ||
                "Unknown"}
            </p>
            <p>
              <strong>Tokens:</strong> {promptRun.tokenCount ?? 0}
            </p>
            <p>
              <strong>Cost estimate:</strong>{" "}
              {promptRun.costEstimate !== null &&
              promptRun.costEstimate !== undefined
                ? `$${promptRun.costEstimate.toFixed(4)}`
                : "N/A"}
            </p>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Filters</h3>
        </div>
        <div className="card">
          <div className="card__body">
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(
                (promptRun.config as any)?.filters ?? {},
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Prompt</h3>
        </div>
        <div className="card">
          <div className="card__body">
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {promptRun.renderedPrompt}
            </pre>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Result</h3>
        </div>
        <div className="card">
          <div className="card__body">
            {promptRun.result ? (
              <pre style={{ whiteSpace: "pre-wrap" }}>{promptRun.result}</pre>
            ) : (
              <p style={{ color: "var(--color-gray-500)" }}>
                No result recorded.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

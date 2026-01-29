"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Column, Document, Project, Run } from "@prisma/client";
import { Button, Select, SelectItem, Textarea } from "@/components/ui";
import {
  DocumentSelection,
  type FilterGroup,
} from "@/components/documents/DocumentSelection";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/models";
import { renderPromptTemplate } from "@/lib/prompts";
import {
  countPromptTokensAction,
  createPromptRunAction,
} from "@/app/actions/prompt-runs";

interface PromptRunWithAuthor extends Run {
  createdBy: { id: string; name: string | null; email: string | null } | null;
}

interface ProjectPromptClientProps {
  project: Project;
  initialDocuments: Document[];
  columns: Column[];
  promptRuns: PromptRunWithAuthor[];
}

const buildDocumentContext = (doc: Document) => {
  const values = (doc.values as Record<string, unknown>) || {};
  const createdAt =
    doc.createdAt instanceof Date
      ? doc.createdAt.toISOString()
      : new Date(doc.createdAt).toISOString();
  return {
    id: doc.id,
    title: doc.title,
    sourceType: doc.sourceType,
    sourceUrl: doc.sourceUrl,
    createdAt,
    ...values,
  };
};

export function ProjectPromptClient({
  project,
  initialDocuments,
  columns,
  promptRuns,
}: ProjectPromptClientProps) {
  const router = useRouter();
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [selectedDocuments, setSelectedDocuments] =
    useState<Document[]>(initialDocuments);
  const [promptTemplate, setPromptTemplate] = useState(
    `{{#each documents}}\nTitle: {{title}}\n{{/each}}`,
  );
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [costEstimate, setCostEstimate] = useState<number | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isCountingTokens, setIsCountingTokens] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const promptContext = useMemo(
    () => ({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      documentCount: selectedDocuments.length,
      documents: selectedDocuments.map(buildDocumentContext),
    }),
    [project, selectedDocuments],
  );

  const expandedPrompt = useMemo(() => {
    try {
      return renderPromptTemplate(promptTemplate, promptContext);
    } catch (error) {
      return "";
    }
  }, [promptTemplate, promptContext]);

  useEffect(() => {
    if (!expandedPrompt.trim()) {
      setTokenCount(null);
      setCostEstimate(null);
      setTokenError(null);
      return;
    }

    let isActive = true;
    setIsCountingTokens(true);
    setTokenError(null);

    const timer = setTimeout(async () => {
      const result = await countPromptTokensAction({
        prompt: expandedPrompt,
        model,
      });
      if (!isActive) return;

      if (result.error) {
        setTokenError(result.error);
        setTokenCount(null);
        setCostEstimate(null);
      } else {
        setTokenCount(result.tokenCount);
        setCostEstimate(result.costEstimate);
      }
      setIsCountingTokens(false);
    }, 350);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [expandedPrompt, model]);

  const handleSendPrompt = () => {
    setSendError(null);
    startTransition(async () => {
      const result = await createPromptRunAction({
        projectId: project.id,
        model,
        promptTemplate,
        filters: filterGroups,
        documentIds: selectedDocuments.map((doc) => doc.id),
      });

      if (result.error) {
        setSendError(result.error);
        return;
      }

      // Do not navigate to detail view. Optionally refresh to show updated prompt run list.
      router.refresh();
    });
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{project.name}</h1>
          {project.description && (
            <p className="page__subtitle">{project.description}</p>
          )}
        </div>
        <div className="page__actions">
          <Button
            variant="secondary"
            onClick={() => router.push(`/projects/${project.id}/edit`)}
          >
            Project Settings
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/projects/${project.id}/documents`)}
          >
            Document Administration
          </Button>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <div>
            <h3 className="section__title">Document Selection</h3>
            <span style={{ fontSize: "14px", color: "var(--color-gray-500)" }}>
              {selectedDocuments.length} document
              {selectedDocuments.length !== 1 ? "s" : ""} selected
            </span>
          </div>
        </div>
        <DocumentSelection
          documents={initialDocuments}
          columns={columns}
          onSelectionChange={setSelectedDocuments}
          onFiltersChange={setFilterGroups}
        />

        <div style={{ marginTop: "12px" }}>
          <strong>Preview:</strong>{" "}
          {selectedDocuments.slice(0, 5).map((doc) => (
            <span
              key={doc.id}
              style={{ marginLeft: "8px", color: "var(--color-gray-500)" }}
            >
              {doc.title}
            </span>
          ))}
          {selectedDocuments.length > 5 && (
            <span style={{ marginLeft: "8px", color: "var(--color-gray-500)" }}>
              +{selectedDocuments.length - 5} more
            </span>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Prompt Builder</h3>
        </div>
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <label className="input__label" htmlFor="promptTemplate">
              Prompt Template (Handlebars)
            </label>
            <Textarea
              id="promptTemplate"
              value={promptTemplate}
              rows={8}
              onChange={(event) => setPromptTemplate(event.target.value)}
              placeholder="Use {{#each documents}} to iterate."
            />
            <span style={{ fontSize: "13px", color: "var(--color-gray-500)" }}>
              Available fields: project.name, documentCount, documents[].title,
              documents[].createdAt, documents[].sourceUrl, and column keys.
            </span>
          </div>

          <div style={{ maxWidth: "280px" }}>
            <label className="input__label" htmlFor="modelSelect">
              Model
            </label>
            <Select value={model} onValueChange={setModel}>
              {CHAT_MODELS.map((chatModel) => (
                <SelectItem key={chatModel.id} value={chatModel.id}>
                  {chatModel.name}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="card">
            <div className="card__body">
              <h4 style={{ marginBottom: "8px" }}>Preview</h4>
              <Textarea value={expandedPrompt} rows={8} readOnly />
            </div>
            <div className="card__footer">
              {tokenError ? (
                <span style={{ color: "var(--color-red-500)" }}>
                  {tokenError}
                </span>
              ) : (
                <span style={{ color: "var(--color-gray-500)" }}>
                  {isCountingTokens
                    ? "Counting tokens..."
                    : `Tokens: ${tokenCount ?? 0} · Cost estimate: ${
                        costEstimate !== null
                          ? `$${costEstimate.toFixed(4)}`
                          : "N/A"
                      }`}
                </span>
              )}
            </div>
          </div>

          {sendError && (
            <p style={{ color: "var(--color-red-500)" }}>{sendError}</p>
          )}

          <Button
            onClick={handleSendPrompt}
            disabled={!expandedPrompt.trim() || selectedDocuments.length === 0}
            isLoading={isPending}
          >
            Send Prompt
          </Button>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Prompt Runs</h3>
        </div>

        {promptRuns.length === 0 ? (
          <div className="empty-state">
            <h2 className="empty-state__title">No prompts yet</h2>
            <p className="empty-state__description">
              Build a prompt to see history and results here.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {promptRuns.map((run) => (
              <div key={run.id} className="card card--clickable">
                <div className="card__body">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <h4>{run.model}</h4>
                      <p style={{ color: "var(--color-gray-500)" }}>
                        {run.createdBy.name ||
                          run.createdBy.email ||
                          "Unknown author"}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        router.push(
                          `/projects/${project.id}/prompts/${run.id}`,
                        )
                      }
                    >
                      View details
                    </Button>
                  </div>
                </div>
                <div className="card__footer">
                  <span style={{ color: "var(--color-gray-500)" }}>
                    {run.status} · Tokens: {run.tokenCount ?? 0} · Cost:{" "}
                    {run.costEstimate !== null && run.costEstimate !== undefined
                      ? `$${run.costEstimate.toFixed(4)}`
                      : "N/A"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

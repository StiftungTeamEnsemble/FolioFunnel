"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  Column,
  Document,
  Project,
  Run,
  PromptTemplate,
} from "@prisma/client";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  Select,
  SelectItem,
  Textarea,
} from "@/components/ui";
import { DocumentSelection } from "@/components/documents/DocumentSelection";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/models";
import { renderPromptTemplate } from "@/lib/prompts";
import {
  createPromptRunAction,
  estimatePromptCostAction,
} from "@/app/actions/prompt-runs";
import type { FilterGroup } from "@/lib/document-filters";
import {
  createPromptTemplateAction,
  updatePromptTemplateAction,
} from "@/app/actions/prompt-templates";
import { formatDateTime } from "@/lib/date-time";
import { DeletePromptTemplateModal } from "@/components/prompts/DeletePromptTemplateModal";
import { DeletePromptRunModal } from "@/components/runs/DeletePromptRunModal";

interface PromptRunWithAuthor extends Run {
  createdBy: { id: string; name: string | null; email: string | null } | null;
}

interface ProjectPromptClientProps {
  project: Project;
  initialDocuments: Document[];
  columns: Column[];
  promptRuns: PromptRunWithAuthor[];
  promptTemplates: PromptTemplate[];
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
  promptTemplates: initialPromptTemplates,
}: ProjectPromptClientProps) {
  const router = useRouter();
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>(
    initialPromptTemplates,
  );
  const [selectedPromptTemplateId, setSelectedPromptTemplateId] = useState<
    string | null
  >(initialPromptTemplates[0]?.id ?? null);
  const selectedPromptTemplate = useMemo(
    () =>
      promptTemplates.find(
        (template) => template.id === selectedPromptTemplateId,
      ) || null,
    [promptTemplates, selectedPromptTemplateId],
  );
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(
    (selectedPromptTemplate?.filters as FilterGroup[]) || [],
  );
  const [selectedDocuments, setSelectedDocuments] =
    useState<Document[]>(initialDocuments);
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [costEstimate, setCostEstimate] = useState<number | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isCountingTokens, setIsCountingTokens] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteTemplateModalOpen, setIsDeleteTemplateModalOpen] =
    useState(false);
  const [promptTemplateToDelete, setPromptTemplateToDelete] =
    useState<PromptTemplate | null>(null);
  const [isDeleteRunModalOpen, setIsDeleteRunModalOpen] = useState(false);
  const [promptRunToDelete, setPromptRunToDelete] =
    useState<PromptRunWithAuthor | null>(null);
  const [builderMode, setBuilderMode] = useState<"create" | "edit">("create");
  const [builderTitle, setBuilderTitle] = useState("");
  const [builderPromptTemplate, setBuilderPromptTemplate] = useState("");
  const [builderFilters, setBuilderFilters] = useState<FilterGroup[]>([]);
  const [builderDocuments, setBuilderDocuments] =
    useState<Document[]>(initialDocuments);
  const [builderSelectedDocuments, setBuilderSelectedDocuments] =
    useState<Document[]>(initialDocuments);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(
    () => new Set(),
  );
  const previewLimit = 3;

  useEffect(() => {
    setPromptTemplates(initialPromptTemplates);
  }, [initialPromptTemplates]);

  useEffect(() => {
    if (!promptTemplates.length) {
      setSelectedPromptTemplateId(null);
      return;
    }

    const exists = promptTemplates.some(
      (template) => template.id === selectedPromptTemplateId,
    );
    if (!exists) {
      setSelectedPromptTemplateId(promptTemplates[0].id);
    }
  }, [promptTemplates, selectedPromptTemplateId]);

  useEffect(() => {
    if (!selectedPromptTemplate) {
      setFilterGroups([]);
      return;
    }
    setFilterGroups((selectedPromptTemplate.filters as FilterGroup[]) || []);
  }, [selectedPromptTemplate]);

  const previewDocuments = useMemo(
    () => selectedDocuments.slice(0, previewLimit),
    [selectedDocuments, previewLimit],
  );

  const promptContext = useMemo(
    () => ({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      documentCount: previewDocuments.length,
      documents: previewDocuments.map(buildDocumentContext),
    }),
    [project, previewDocuments],
  );

  const expandedPrompt = useMemo(() => {
    try {
      return renderPromptTemplate(
        selectedPromptTemplate?.promptTemplate ?? "",
        promptContext,
      );
    } catch (error) {
      return "";
    }
  }, [selectedPromptTemplate, promptContext]);

  useEffect(() => {
    if (!selectedPromptTemplate) {
      setTokenCount(null);
      setCostEstimate(null);
      setTokenError(null);
      return;
    }

    let isActive = true;
    setIsCountingTokens(true);
    setTokenError(null);

    const timer = setTimeout(async () => {
      const result = await estimatePromptCostAction({
        projectId: project.id,
        promptTemplateId: selectedPromptTemplate.id,
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
  }, [model, project.id, selectedPromptTemplate]);

  const fetchDocuments = async (
    filters: FilterGroup[],
    signal: AbortSignal,
  ) => {
    const response = await fetch(
      `/api/projects/${project.id}/documents/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, includeRuns: false }),
        signal,
      },
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { documents: Document[] };
    return data.documents;
  };

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await fetchDocuments(filterGroups, controller.signal);
        if (!isActive) return;
        setSelectedDocuments(data);
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
        console.error("Failed to fetch filtered documents", error);
      }
    }, 350);

    return () => {
      isActive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [filterGroups, project.id]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await fetchDocuments(builderFilters, controller.signal);
        if (!isActive) return;
        setBuilderDocuments(data);
        setBuilderSelectedDocuments(data);
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
        console.error("Failed to fetch builder documents", error);
      }
    }, 350);

    return () => {
      isActive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [builderFilters, project.id]);

  const handleSendPrompt = () => {
    setSendError(null);
    if (!selectedPromptTemplate) {
      setSendError("Select a prompt template.");
      return;
    }

    startTransition(async () => {
      const result = await createPromptRunAction({
        projectId: project.id,
        model,
        promptTemplateId: selectedPromptTemplate.id,
      });

      if (result.error) {
        setSendError(result.error);
        return;
      }

      // Do not navigate to detail view. Optionally refresh to show updated prompt run list.
      router.refresh();
    });
  };

  const getPromptTemplateTitle = (run: Run) => {
    if (!run.config || typeof run.config !== "object") {
      return null;
    }
    const config = run.config as Record<string, unknown>;
    return typeof config.promptTemplateTitle === "string"
      ? config.promptTemplateTitle
      : null;
  };

  const isRunExpanded = (runId: string, index: number) =>
    index === 0 || expandedRunIds.has(runId);

  const toggleRunExpanded = (runId: string) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const handleDeletePromptRun = (run: PromptRunWithAuthor) => {
    setPromptRunToDelete(run);
    setIsDeleteRunModalOpen(true);
  };

  const handleCopy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
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
            onClick={() => router.push(`/projects/${project.id}/documents`)}
          >
            Documents
          </Button>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <div>
            <h3 className="section__title">Prompt Templates</h3>
            <span style={{ fontSize: "14px", color: "var(--color-gray-500)" }}>
              {promptTemplates.length} saved template
              {promptTemplates.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setBuilderMode("create");
                setBuilderTitle("");
                setBuilderPromptTemplate(
                  `{{#each documents}}\nTitle: {{title}}\n{{/each}}`,
                );
                setBuilderFilters([]);
                setBuilderDocuments(initialDocuments);
                setBuilderSelectedDocuments(initialDocuments);
                setBuilderError(null);
                setIsModalOpen(true);
              }}
            >
              New Prompt
            </Button>
          </div>
        </div>

        {promptTemplates.length === 0 ? (
          <div className="empty-state">
            <h2 className="empty-state__title">No prompt templates yet</h2>
            <p className="empty-state__description">
              Create a prompt template to define your document filters and
              prompt content.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div style={{ maxWidth: "360px", flex: "1 1 260px" }}>
                <label className="input__label" htmlFor="promptTemplateSelect">
                  Prompt Template
                </label>
                <Select
                  value={selectedPromptTemplate?.id ?? ""}
                  onValueChange={(value) =>
                    setSelectedPromptTemplateId(value || null)
                  }
                >
                  {promptTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!selectedPromptTemplate) return;
                    setBuilderMode("edit");
                    setBuilderTitle(selectedPromptTemplate.title);
                    setBuilderPromptTemplate(
                      selectedPromptTemplate.promptTemplate,
                    );
                    setBuilderFilters(
                      (selectedPromptTemplate.filters as FilterGroup[]) || [],
                    );
                    setBuilderDocuments(initialDocuments);
                    setBuilderSelectedDocuments(initialDocuments);
                    setBuilderError(null);
                    setIsModalOpen(true);
                  }}
                  disabled={!selectedPromptTemplate}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!selectedPromptTemplate) return;
                    setPromptTemplateToDelete(selectedPromptTemplate);
                    setIsDeleteTemplateModalOpen(true);
                  }}
                  disabled={!selectedPromptTemplate}
                >
                  Delete
                </Button>
              </div>
            </div>
            <div style={{ marginTop: "4px" }}>
              <strong>Documents:</strong> {selectedDocuments.length} document
              {selectedDocuments.length !== 1 ? "s" : ""} selected
              {selectedDocuments.length > 0 && (
                <>
                  {" "}
                  ·{" "}
                  {selectedDocuments.slice(0, 3).map((doc, index) => (
                    <span
                      key={doc.id}
                      style={{
                        marginLeft: index === 0 ? "4px" : "8px",
                        color: "var(--color-gray-500)",
                      }}
                    >
                      {doc.title}
                    </span>
                  ))}
                  {selectedDocuments.length > 3 && (
                    <span
                      style={{
                        marginLeft: "8px",
                        color: "var(--color-gray-500)",
                      }}
                    >
                      +{selectedDocuments.length - 3} more
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Prompt Run</h3>
        </div>
        <div style={{ display: "grid", gap: "12px" }}>
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
              <p
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "var(--color-gray-500)",
                }}
              >
                Preview uses {previewDocuments.length} of{" "}
                {selectedDocuments.length} document
                {selectedDocuments.length !== 1 ? "s" : ""}.
              </p>
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
                    : `Tokens (input): ${tokenCount ?? 0} · Cost estimate (input): ${
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
            disabled={
              !expandedPrompt.trim() ||
              selectedDocuments.length === 0 ||
              !selectedPromptTemplate
            }
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
            {promptRuns.map((run, index) => {
              const templateTitle = getPromptTemplateTitle(run);
              const isExpanded = isRunExpanded(run.id, index);
              return (
                <div key={run.id} className="card card--clickable">
                  <div className="card__body">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ display: "grid", gap: "4px" }}>
                        <h4>{templateTitle || "Untitled template"}</h4>
                        <p style={{ color: "var(--color-gray-500)" }}>
                          {run.createdBy?.name ||
                            run.createdBy?.email ||
                            "Unknown author"}
                        </p>
                        <p style={{ color: "var(--color-gray-500)" }}>
                          Created: {formatDateTime(run.createdAt)}
                        </p>
                        <p style={{ color: "var(--color-gray-500)" }}>
                          Model: {run.model || "Prompt Run"}
                        </p>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {run.result && index !== 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => toggleRunExpanded(run.id)}
                          >
                            {isExpanded ? "Collapse" : "Expand"}
                          </Button>
                        )}
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
                    {run.result && isExpanded && (
                      <div style={{ marginTop: "12px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <strong>Response</strong>
                          <button
                            type="button"
                            className="table__cell__copy"
                            onClick={() => handleCopy(run.result || "")}
                            aria-label="Copy response"
                          >
                            Copy
                          </button>
                        </div>
                        <div
                          style={{
                            marginTop: "8px",
                            whiteSpace: "pre-wrap",
                            wordWrap: "normal",
                            color: "var(--color-gray-700)",
                            fontFamily: "inherit",
                          }}
                        >
                          {run.result}
                        </div>
                      </div>
                    )}
                  </div>
                  <div
                    className="card__footer"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <RunStatusBadge status={run.status} />
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: "var(--color-gray-500)" }}>
                        Tokens: {run.tokenCount ?? 0} · Cost:{" "}
                        {run.costEstimate !== null &&
                        run.costEstimate !== undefined
                          ? `$${run.costEstimate.toFixed(4)}`
                          : "N/A"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePromptRun(run)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent
          title={
            builderMode === "create"
              ? "New Prompt Template"
              : "Edit Prompt Template"
          }
          description="Define the title, document filters, and prompt template."
          size="lg"
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <label className="input__label" htmlFor="promptTitle">
                Title
              </label>
              <Input
                id="promptTitle"
                value={builderTitle}
                onChange={(event) => setBuilderTitle(event.target.value)}
                placeholder="e.g. Weekly summary"
              />
            </div>

            <div>
              <h4 style={{ marginBottom: "8px" }}>Document Selection</h4>
              <DocumentSelection
                key={`${builderMode}-${selectedPromptTemplate?.id ?? "new"}`}
                documents={builderDocuments}
                columns={columns}
                onSelectionChange={setBuilderSelectedDocuments}
                onFiltersChange={setBuilderFilters}
                initialFilterGroups={builderFilters}
                serverFiltering
              />
              <div
                style={{ marginTop: "10px", color: "var(--color-gray-500)" }}
              >
                {builderSelectedDocuments.length} document
                {builderSelectedDocuments.length !== 1 ? "s" : ""} selected
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              <label className="input__label" htmlFor="promptTemplateInput">
                Prompt Template (Handlebars)
              </label>
              <Textarea
                id="promptTemplateInput"
                value={builderPromptTemplate}
                rows={8}
                onChange={(event) =>
                  setBuilderPromptTemplate(event.target.value)
                }
                placeholder="Use {{#each documents}} to iterate."
              />
              <span
                style={{ fontSize: "13px", color: "var(--color-gray-500)" }}
              >
                Available fields: project.name, documentCount,
                documents[].title, documents[].createdAt, documents[].sourceUrl,
                and column keys.
              </span>
            </div>

            {builderError && (
              <p style={{ color: "var(--color-red-500)" }}>{builderError}</p>
            )}
          </div>

          <ModalFooter>
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setBuilderError(null);
                  const payload = {
                    projectId: project.id,
                    title: builderTitle,
                    promptTemplate: builderPromptTemplate,
                    filters: builderFilters,
                  };

                  const result =
                    builderMode === "create"
                      ? await createPromptTemplateAction(payload)
                      : await updatePromptTemplateAction({
                          ...payload,
                          promptTemplateId: selectedPromptTemplate?.id ?? "",
                        });

                  if (result.error) {
                    setBuilderError(result.error);
                    return;
                  }

                  if (result.template) {
                    setSelectedPromptTemplateId(result.template.id);
                  }

                  setIsModalOpen(false);
                  router.refresh();
                }}
              >
                {builderMode === "create" ? "Create" : "Save"}
              </Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <DeletePromptTemplateModal
        projectId={project.id}
        promptTemplate={promptTemplateToDelete}
        open={isDeleteTemplateModalOpen}
        onOpenChange={(open) => {
          setIsDeleteTemplateModalOpen(open);
          if (!open) {
            setPromptTemplateToDelete(null);
          }
        }}
        onSuccess={() => {
          setSelectedPromptTemplateId(null);
          router.refresh();
        }}
      />

      <DeletePromptRunModal
        projectId={project.id}
        run={promptRunToDelete}
        open={isDeleteRunModalOpen}
        onOpenChange={(open) => {
          setIsDeleteRunModalOpen(open);
          if (!open) {
            setPromptRunToDelete(null);
          }
        }}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}

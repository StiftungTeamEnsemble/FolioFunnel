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
  MetaLine,
  MetaSeparator,
} from "@/components/ui";
import { DocumentSelection } from "@/components/documents/DocumentSelection";
import { DocumentPreviewList } from "@/components/documents/DocumentPreviewList";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/models";
import { renderPromptTemplate } from "@/lib/prompts";
import {
  createPromptRunAction,
  estimatePromptCostAction,
  updatePromptRunTagsAction,
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
  tags: string[];
  createdBy: { id: string; name: string | null; email: string | null } | null;
}

interface ProjectPromptClientProps {
  project: Project & { resultTags: string[] };
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
  const [runs, setRuns] = useState<PromptRunWithAuthor[]>(promptRuns);
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
    (selectedPromptTemplate?.filters as unknown as FilterGroup[]) || [],
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
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [updatingRunIds, setUpdatingRunIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tagError, setTagError] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const previewLimit = 3;

  useEffect(() => {
    setPromptTemplates(initialPromptTemplates);
  }, [initialPromptTemplates]);

  useEffect(() => {
    setRuns(promptRuns);
  }, [promptRuns]);

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
    setFilterGroups(
      (selectedPromptTemplate.filters as unknown as FilterGroup[]) || [],
    );
  }, [selectedPromptTemplate]);

  const previewDocuments = useMemo(
    () => selectedDocuments.slice(0, previewLimit),
    [selectedDocuments, previewLimit],
  );

  const promptContext = useMemo(() => {
    if (!isPreviewModalOpen) {
      return null;
    }
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      documentCount: previewDocuments.length,
      documents: previewDocuments.map(buildDocumentContext),
    };
  }, [isPreviewModalOpen, project, previewDocuments]);

  const expandedPrompt = useMemo(() => {
    if (!isPreviewModalOpen || !selectedPromptTemplate || !promptContext) {
      return "";
    }
    try {
      return renderPromptTemplate(
        selectedPromptTemplate.promptTemplate ?? "",
        promptContext,
      );
    } catch (error) {
      return "";
    }
  }, [isPreviewModalOpen, selectedPromptTemplate, promptContext]);

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
        setTokenCount(result.tokenCount ?? null);
        setCostEstimate(result.costEstimate ?? null);
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

  const isRunExpanded = (runId: string) => expandedRunIds.has(runId);

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

  const projectTags = useMemo(
    () => (project.resultTags || []) as string[],
    [project.resultTags],
  );

  const filteredRuns = useMemo(() => {
    if (!selectedTagFilters.length) {
      return runs;
    }
    return runs.filter((run) =>
      (run.tags || []).some((tag) => selectedTagFilters.includes(tag)),
    );
  }, [runs, selectedTagFilters]);

  const toggleTagFilter = (tag: string) => {
    setSelectedTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const handleToggleRunTag = async (runId: string, tag: string) => {
    const run = runs.find((item) => item.id === runId);
    if (!run) return;
    setTagError(null);

    const currentTags = run.tags || [];
    const nextTags = currentTags.includes(tag)
      ? currentTags.filter((item) => item !== tag)
      : [...currentTags, tag];

    setRuns((prev) =>
      prev.map((item) =>
        item.id === runId ? { ...item, tags: nextTags } : item,
      ),
    );
    setUpdatingRunIds((prev) => new Set(prev).add(runId));

    const result = await updatePromptRunTagsAction({
      projectId: project.id,
      promptRunId: runId,
      tags: nextTags,
    });

    if (result.error) {
      setRuns((prev) =>
        prev.map((item) =>
          item.id === runId ? { ...item, tags: currentTags } : item,
        ),
      );
      setTagError(result.error);
    } else if (result.tags) {
      setRuns((prev) =>
        prev.map((item) =>
          item.id === runId ? { ...item, tags: result.tags } : item,
        ),
      );
    }

    setUpdatingRunIds((prev) => {
      const next = new Set(prev);
      next.delete(runId);
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
            <h3 className="section__title">Prompt</h3>
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
              <div style={{ maxWidth: "280px", flex: "1 1 220px" }}>
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
                  size="md"
                  onClick={() => {
                    if (!selectedPromptTemplate) return;
                    setBuilderMode("edit");
                    setBuilderTitle(selectedPromptTemplate.title);
                    setBuilderPromptTemplate(
                      selectedPromptTemplate.promptTemplate,
                    );
                    setBuilderFilters(
                      (selectedPromptTemplate.filters as unknown as FilterGroup[]) ||
                        [],
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
                  size="md"
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
            <DocumentPreviewList
              documents={selectedDocuments}
              projectId={project.id}
            />
          </div>
        )}
      </div>

      <div className="section">
        <div style={{ display: "grid", gap: "12px" }}>
          {sendError && (
            <p style={{ color: "var(--color-red-500)" }}>{sendError}</p>
          )}

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              onClick={() => setIsPreviewModalOpen(true)}
              disabled={
                !selectedPromptTemplate || selectedDocuments.length === 0
              }
            >
              View prompt preview
            </Button>
            <Button
              onClick={handleSendPrompt}
              disabled={
                !selectedPromptTemplate || selectedDocuments.length === 0
              }
              isLoading={isPending}
            >
              Send Prompt
            </Button>
          </div>

          {tokenError ? (
            <MetaLine style={{ color: "var(--color-red-500)", marginTop: 0 }}>
              {tokenError}
            </MetaLine>
          ) : (
            <MetaLine style={{ marginTop: 0 }}>
              {isCountingTokens ? (
                <span>Counting tokens...</span>
              ) : (
                <>
                  <span>Tokens (input): {tokenCount ?? 0}</span>
                  <MetaSeparator />
                  <span>
                    Cost estimate (input):{" "}
                    {costEstimate !== null
                      ? `$${costEstimate.toFixed(4)}`
                      : "N/A"}
                  </span>
                </>
              )}
            </MetaLine>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3 className="section__title">Results</h3>
        </div>

        {promptRuns.length === 0 ? (
          <div className="empty-state">
            <h2 className="empty-state__title">No prompts yet</h2>
            <p className="empty-state__description">
              Build a prompt to see history and results here.
            </p>
          </div>
        ) : (
          <>
            {projectTags.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "12px",
                }}
              >
                <span style={{ fontWeight: 600 }}>Filter by tag:</span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {projectTags.map((tag) => {
                    const isActive = selectedTagFilters.includes(tag);
                    return (
                      <Button
                        key={tag}
                        variant={isActive ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => toggleTagFilter(tag)}
                      >
                        {tag}
                      </Button>
                    );
                  })}
                  {selectedTagFilters.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTagFilters([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}
            {tagError && (
              <p style={{ color: "var(--color-red-500)" }}>{tagError}</p>
            )}
            {filteredRuns.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <h2 className="empty-state__title">No results found</h2>
                <p className="empty-state__description">
                  No results match the selected tags.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {filteredRuns.map((run) => {
                  const templateTitle = getPromptTemplateTitle(run);
                  const isExpanded = isRunExpanded(run.id);
                  const runTags = run.tags || [];
                  const isUpdating = updatingRunIds.has(run.id);
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
                            <MetaLine style={{ marginTop: 0 }}>
                              <span>
                                {run.createdBy?.name ||
                                  run.createdBy?.email ||
                                  "Unknown author"}
                              </span>
                              <MetaSeparator />
                              <span>{formatDateTime(run.createdAt)}</span>
                              <MetaSeparator />
                              <span>{run.model || "Prompt Run"}</span>
                            </MetaLine>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            {run.result && (
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
                        {projectTags.length > 0 && (
                          <div style={{ marginTop: "12px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <MetaLine style={{ marginTop: 0 }}>Tags</MetaLine>

                              {projectTags.map((tag) => {
                                const isSelected = runTags.includes(tag);
                                return (
                                  <Button
                                    key={`${run.id}-${tag}`}
                                    variant={
                                      isSelected ? "primary" : "secondary"
                                    }
                                    size="tag"
                                    onClick={() =>
                                      handleToggleRunTag(run.id, tag)
                                    }
                                    disabled={isUpdating}
                                  >
                                    {tag}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}
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
                          <MetaLine style={{ marginTop: 0 }}>
                            <span>Tokens: {run.tokenCount ?? 0}</span>
                            <MetaSeparator />
                            <span>
                              Cost:{" "}
                              {run.costEstimate !== null &&
                              run.costEstimate !== undefined
                                ? `$${run.costEstimate.toFixed(4)}`
                                : "N/A"}
                            </span>
                          </MetaLine>
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
          </>
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
              <div style={{ marginTop: "10px" }}>
                <DocumentPreviewList
                  documents={builderSelectedDocuments}
                  projectId={project.id}
                  label="Selected documents"
                />
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

      <Modal open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <ModalContent
          title="Prompt preview"
          description={
            selectedPromptTemplate?.title || "Selected prompt template"
          }
          size="lg"
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <Textarea value={expandedPrompt} rows={10} readOnly />
            <p style={{ fontSize: "12px", color: "var(--color-gray-500)" }}>
              Preview uses {previewDocuments.length} of{" "}
              {selectedDocuments.length} document
              {selectedDocuments.length !== 1 ? "s" : ""}.
            </p>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Column, Document, Project, Run } from "@prisma/client";
import { Button, Input, Select, SelectItem, Textarea } from "@/components/ui";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/models";
import { renderPromptTemplate } from "@/lib/prompts";
import {
  countPromptTokensAction,
  createPromptRunAction,
} from "@/app/actions/prompt-runs";

type FilterOperator = "contains" | "equals" | "lt" | "gt";
type FilterJoin = "and" | "or";

interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

interface FilterGroup {
  id: string;
  join: FilterJoin;
  rules: FilterRule[];
}

interface PromptRunWithAuthor extends Run {
  createdBy: { id: string; name: string | null; email: string | null } | null;
}

interface ProjectPromptClientProps {
  project: Project;
  initialDocuments: Document[];
  columns: Column[];
  promptRuns: PromptRunWithAuthor[];
}

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createRule = (): FilterRule => ({
  id: createId(),
  field: "title",
  operator: "contains",
  value: "",
});

const createGroup = (): FilterGroup => ({
  id: createId(),
  join: "and",
  rules: [createRule()],
});

const normalizeString = (value: unknown) =>
  (value ?? "").toString().toLowerCase();

const toComparableNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toComparableDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const getDocumentFieldValue = (
  doc: Document,
  field: string,
): unknown | null => {
  const values = (doc.values as Record<string, unknown>) || {};

  if (field.startsWith("column:")) {
    const key = field.replace("column:", "");
    return values[key];
  }

  switch (field) {
    case "title":
      return doc.title;
    case "source":
      return `${doc.sourceType}${doc.sourceUrl ? ` ${doc.sourceUrl}` : ""}`;
    case "created":
      return doc.createdAt;
    default:
      return null;
  }
};

const matchesRule = (doc: Document, rule: FilterRule) => {
  const value = getDocumentFieldValue(doc, rule.field);
  const input = rule.value.trim();

  if (!input) {
    return true;
  }

  if (rule.operator === "contains") {
    return normalizeString(value).includes(normalizeString(input));
  }

  if (rule.operator === "equals") {
    return normalizeString(value) === normalizeString(input);
  }

  if (rule.operator === "lt" || rule.operator === "gt") {
    const numericValue = toComparableNumber(value);
    const numericInput = toComparableNumber(input);

    if (numericValue !== null && numericInput !== null) {
      return rule.operator === "lt"
        ? numericValue < numericInput
        : numericValue > numericInput;
    }

    const dateValue = toComparableDate(value);
    const dateInput = toComparableDate(input);

    if (dateValue !== null && dateInput !== null) {
      return rule.operator === "lt"
        ? dateValue < dateInput
        : dateValue > dateInput;
    }

    return false;
  }

  return false;
};

const matchesGroup = (doc: Document, group: FilterGroup) => {
  if (group.rules.length === 0) return true;
  return group.join === "and"
    ? group.rules.every((rule) => matchesRule(doc, rule))
    : group.rules.some((rule) => matchesRule(doc, rule));
};

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
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([
    createGroup(),
  ]);
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

  const selectedDocuments = useMemo(() => {
    if (!filterGroups.length) return initialDocuments;
    return initialDocuments.filter((doc) =>
      filterGroups.every((group) => matchesGroup(doc, group)),
    );
  }, [filterGroups, initialDocuments]);

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

  const addGroup = () => {
    setFilterGroups((prev) => [...prev, createGroup()]);
  };

  const updateGroup = (groupId: string, updates: Partial<FilterGroup>) => {
    setFilterGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, ...updates } : group,
      ),
    );
  };

  const removeGroup = (groupId: string) => {
    setFilterGroups((prev) => prev.filter((group) => group.id !== groupId));
  };

  const addRule = (groupId: string) => {
    setFilterGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, rules: [...group.rules, createRule()] }
          : group,
      ),
    );
  };

  const updateRule = (
    groupId: string,
    ruleId: string,
    updates: Partial<FilterRule>,
  ) => {
    setFilterGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rules: group.rules.map((rule) =>
                rule.id === ruleId ? { ...rule, ...updates } : rule,
              ),
            }
          : group,
      ),
    );
  };

  const removeRule = (groupId: string, ruleId: string) => {
    setFilterGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rules: group.rules.filter((rule) => rule.id !== ruleId),
            }
          : group,
      ),
    );
  };

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
          <Button variant="secondary" size="sm" onClick={addGroup}>
            Add filter group
          </Button>
        </div>

        {filterGroups.map((group, groupIndex) => (
          <div key={group.id} className="card" style={{ marginBottom: "16px" }}>
            <div className="card__body">
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ minWidth: "160px" }}>
                  <Select
                    value={group.join}
                    onValueChange={(value) =>
                      updateGroup(group.id, { join: value as FilterJoin })
                    }
                  >
                    <SelectItem value="and">Match all rules</SelectItem>
                    <SelectItem value="or">Match any rule</SelectItem>
                  </Select>
                </div>
                {filterGroups.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGroup(group.id)}
                  >
                    Remove group
                  </Button>
                )}
              </div>

              <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
                {group.rules.map((rule, ruleIndex) => (
                  <div
                    key={rule.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr auto",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <Select
                      value={rule.field}
                      onValueChange={(value) =>
                        updateRule(group.id, rule.id, { field: value })
                      }
                    >
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="source">Source</SelectItem>
                      <SelectItem value="created">Created date</SelectItem>
                      {columns.map((column) => (
                        <SelectItem
                          key={column.id}
                          value={`column:${column.key}`}
                        >
                          {column.name}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      value={rule.operator}
                      onValueChange={(value) =>
                        updateRule(group.id, rule.id, {
                          operator: value as FilterOperator,
                        })
                      }
                    >
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="lt">Less than</SelectItem>
                      <SelectItem value="gt">Greater than</SelectItem>
                    </Select>
                    <Input
                      value={rule.value}
                      onChange={(event) =>
                        updateRule(group.id, rule.id, {
                          value: event.target.value,
                        })
                      }
                      placeholder="Value"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRule(group.id, rule.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "12px" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => addRule(group.id)}
                >
                  Add rule
                </Button>
              </div>
            </div>
            <div className="card__footer">
              <span style={{ color: "var(--color-gray-500)" }}>
                Group {groupIndex + 1}: {group.rules.length} rule
                {group.rules.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        ))}

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

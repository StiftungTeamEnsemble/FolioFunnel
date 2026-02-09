"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { Column, Document } from "@prisma/client";
import { Button, Input, Select, SelectItem } from "@/components/ui";
import { formatDateTime } from "@/lib/date-time";
import type {
  FilterGroup,
  FilterJoin,
  FilterOperator,
  FilterRule,
} from "@/lib/document-filters";

interface DocumentSelectionProps<T extends Document> {
  documents: T[];
  columns: Column[];
  onSelectionChange?: (selectedDocuments: T[]) => void;
  onFiltersChange?: (filters: FilterGroup[]) => void;
  initialFilterGroups?: FilterGroup[];
  serverFiltering?: boolean;
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

const isQuickSearchGroup = (groups: FilterGroup[] | undefined) => {
  if (!groups || groups.length !== 1) return false;
  const [group] = groups;
  if (group.rules.length !== 1) return false;
  const [rule] = group.rules;
  return rule.field === "all" && rule.operator === "contains";
};

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

const buildSourceText = (doc: Document) =>
  `${doc.sourceType}${doc.sourceUrl ? ` ${doc.sourceUrl}` : ""}`;

const getDocumentFieldValue = (doc: Document, field: string): unknown => {
  const values = (doc.values as Record<string, unknown>) || {};

  if (field.startsWith("column:")) {
    const key = field.replace("column:", "");
    return values[key];
  }

  switch (field) {
    case "title":
      return doc.title;
    case "source":
      return buildSourceText(doc);
    case "created":
      return doc.createdAt;
    default:
      return null;
  }
};

const getAllDocumentValues = (doc: Document): unknown[] => {
  const values = (doc.values as Record<string, unknown>) || {};
  return [
    doc.title,
    buildSourceText(doc),
    doc.createdAt,
    formatDateTime(doc.createdAt),
    ...Object.values(values),
  ];
};

const matchesValue = (
  value: unknown,
  operator: FilterOperator,
  input: string,
) => {
  if (operator === "contains") {
    return normalizeString(value).includes(normalizeString(input));
  }

  if (operator === "equals") {
    return normalizeString(value) === normalizeString(input);
  }

  if (operator === "lt" || operator === "gt") {
    const numericValue = toComparableNumber(value);
    const numericInput = toComparableNumber(input);

    if (numericValue !== null && numericInput !== null) {
      return operator === "lt"
        ? numericValue < numericInput
        : numericValue > numericInput;
    }

    const dateValue = toComparableDate(value);
    const dateInput = toComparableDate(input);

    if (dateValue !== null && dateInput !== null) {
      return operator === "lt" ? dateValue < dateInput : dateValue > dateInput;
    }

    return false;
  }

  return false;
};

const matchesRule = (doc: Document, rule: FilterRule) => {
  const input = rule.value.trim();

  if (!input) {
    return true;
  }

  if (rule.field === "all") {
    return getAllDocumentValues(doc).some((value) =>
      matchesValue(value, rule.operator, input),
    );
  }

  const value = getDocumentFieldValue(doc, rule.field);
  return matchesValue(value, rule.operator, input);
};

const matchesGroup = (doc: Document, group: FilterGroup) => {
  if (group.rules.length === 0) return true;
  return group.join === "and"
    ? group.rules.every((rule) => matchesRule(doc, rule))
    : group.rules.some((rule) => matchesRule(doc, rule));
};

const matchesQuickSearch = (doc: Document, searchTerm: string) => {
  const input = searchTerm.trim();
  if (!input) return true;
  return getAllDocumentValues(doc).some((value) =>
    normalizeString(value).includes(normalizeString(input)),
  );
};

export function DocumentSelection<T extends Document>({
  documents,
  columns,
  onSelectionChange,
  onFiltersChange,
  initialFilterGroups,
  serverFiltering = false,
}: DocumentSelectionProps<T>) {
  const [quickSearch, setQuickSearch] = useState("");
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(
    initialFilterGroups?.length ? initialFilterGroups : [createGroup()],
  );

  const quickGroupId = useRef(createId());
  const quickRuleId = useRef(createId());

  useEffect(() => {
    if (!initialFilterGroups?.length) {
      setIsExpertMode(false);
      setQuickSearch("");
      setFilterGroups([createGroup()]);
      return;
    }

    if (isQuickSearchGroup(initialFilterGroups)) {
      const quickValue = initialFilterGroups[0]?.rules[0]?.value ?? "";
      setQuickSearch(quickValue);
      setIsExpertMode(false);
      setFilterGroups(initialFilterGroups);
      return;
    }

    setIsExpertMode(true);
    setQuickSearch("");
    setFilterGroups(initialFilterGroups);
  }, [initialFilterGroups]);

  const expertFilteredDocuments = useMemo(() => {
    if (serverFiltering) return documents;
    if (!filterGroups.length) return documents;
    return documents.filter((doc) =>
      filterGroups.every((group) => matchesGroup(doc, group)),
    );
  }, [documents, filterGroups, serverFiltering]);

  const quickFilteredDocuments = useMemo(() => {
    if (serverFiltering) return documents;
    return documents.filter((doc) => matchesQuickSearch(doc, quickSearch));
  }, [documents, quickSearch, serverFiltering]);

  const selectedDocuments = useMemo(() => {
    if (serverFiltering) return documents;
    if (!isExpertMode) return quickFilteredDocuments;
    return expertFilteredDocuments.filter((doc) =>
      matchesQuickSearch(doc, quickSearch),
    );
  }, [
    documents,
    serverFiltering,
    isExpertMode,
    quickFilteredDocuments,
    expertFilteredDocuments,
    quickSearch,
  ]);

  const activeFilters = useMemo(() => {
    if (isExpertMode) return filterGroups;

    return [
      {
        id: quickGroupId.current,
        join: "and",
        rules: [
          {
            id: quickRuleId.current,
            field: "all",
            operator: "contains",
            value: quickSearch,
          },
        ],
      },
    ];
  }, [filterGroups, isExpertMode, quickSearch]);

  useEffect(() => {
    onSelectionChange?.(selectedDocuments);
  }, [onSelectionChange, selectedDocuments]);

  useEffect(() => {
    onFiltersChange?.(activeFilters as FilterGroup[]);
  }, [activeFilters, onFiltersChange]);

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

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {!isExpertMode && (
          <Input
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            placeholder="Search all fields"
            aria-label="Search all fields"
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsExpertMode((prev) => !prev)}
          style={{ marginBottom: "8px" }}
        >
          {isExpertMode ? "Hide expert filters" : "Enable expert filters"}
        </Button>
      </div>

      {isExpertMode && (
        <div style={{ display: "grid", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <strong>Expert filters</strong>
            <Button variant="secondary" size="sm" onClick={addGroup}>
              Add filter group
            </Button>
          </div>

          {filterGroups.map((group, groupIndex) => (
            <div
              key={group.id}
              className="card"
              style={{ marginBottom: "8px" }}
            >
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

                <div
                  style={{ marginTop: "12px", display: "grid", gap: "12px" }}
                >
                  {group.rules.map((rule) => (
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
                        <SelectItem value="all">All fields</SelectItem>
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
        </div>
      )}
    </div>
  );
}

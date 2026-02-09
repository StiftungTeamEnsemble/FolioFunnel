"use client";

import { useEffect, useMemo, useState } from "react";
import { Column, Document, RunStatus } from "@prisma/client";
import { Button } from "@/components/ui";
import { updateDocumentValue } from "@/app/actions/documents";
import { updateColumnVisibility } from "@/app/actions/columns";
import { triggerProcessorRun, redownloadUrl } from "@/app/actions/runs";
import { DocumentDetailModal } from "@/components/documents/DocumentDetailModal";
import { ManualArrayEditorModal } from "@/components/documents/ManualArrayEditorModal";
import {
  getDocumentThumbnailUrl,
  PDF_THUMBNAIL_COLUMN_KEY,
} from "@/lib/thumbnails";
import { formatDateTime } from "@/lib/date-time";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import "@/styles/components/table.css";

interface DocumentWithRuns extends Document {
  latestRuns?: Record<
    string,
    {
      status: RunStatus;
      error: string | null;
    }
  >;
  uploadedBy?: { name: string | null; email: string | null } | null;
}

interface KnowledgeTableProps {
  projectId: string;
  documents: DocumentWithRuns[];
  columns: Column[];
  onRefresh: () => void;
  sortState: SortState;
  onSort: (type: SortState["type"], key: string) => void;
  onEditColumn?: (column: Column) => void;
  onDeleteColumn?: (column: Column) => void;
  onDeleteDocument?: (document: Document) => void;
}

const BASE_COLUMNS = [
  { key: "title", label: "Title" },
  { key: "source", label: "Source" },
  { key: "uploader", label: "Uploader" },
  { key: "created", label: "Created" },
] as const;

export type BaseColumnKey = (typeof BASE_COLUMNS)[number]["key"];
export type SortDirection = "asc" | "desc";
export type SortState =
  | { type: "base"; key: BaseColumnKey; direction: SortDirection }
  | { type: "column"; key: string; direction: SortDirection };

export function KnowledgeTable({
  projectId,
  documents,
  columns,
  onRefresh,
  sortState,
  onSort,
  onEditColumn,
  onDeleteColumn,
  onDeleteDocument,
}: KnowledgeTableProps) {
  const [editingCell, setEditingCell] = useState<{
    docId: string;
    columnKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [optimisticValues, setOptimisticValues] = useState<
    Record<string, unknown>
  >({});
  const [arrayEditState, setArrayEditState] = useState<{
    docId: string;
    column: Column;
    values: string[];
  } | null>(null);
  const [arrayEditError, setArrayEditError] = useState<string | null>(null);
  const [detailDocument, setDetailDocument] = useState<DocumentWithRuns | null>(
    null,
  );
  const [hiddenBaseColumns, setHiddenBaseColumns] = useState<Set<string>>(
    new Set(),
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => !column.hidden),
    [columns],
  );

  const hiddenColumns = useMemo(
    () => columns.filter((column) => column.hidden),
    [columns],
  );
  const hiddenBaseColumnEntries = useMemo(
    () => BASE_COLUMNS.filter((column) => hiddenBaseColumns.has(column.key)),
    [hiddenBaseColumns],
  );
  const isBaseColumnVisible = (key: string) => !hiddenBaseColumns.has(key);

  const handleHideColumn = async (columnId: string) => {
    await updateColumnVisibility(projectId, columnId, true);
    onRefresh();
  };

  const handleHideBaseColumn = (key: string) => {
    setHiddenBaseColumns((prev) => new Set(prev).add(key));
  };

  const handleShowBaseColumn = (key: string) => {
    setHiddenBaseColumns((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleShowColumn = async (columnId: string) => {
    await updateColumnVisibility(projectId, columnId, false);
    onRefresh();
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

  const handleEditStart = (doc: Document, column: Column) => {
    const values = (doc.values as Record<string, unknown>) || {};
    const value = values[column.key];
    if (value === null || value === undefined) {
      setEditValue("");
    } else if (typeof value === "string") {
      setEditValue(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      setEditValue(String(value));
    } else {
      setEditValue(JSON.stringify(value));
    }
    setEditingCell({
      docId: doc.id,
      columnKey: column.key,
    });
  };

  const handleEditSave = async () => {
    if (!editingCell) return;

    const valueToSave = editValue;
    const { docId, columnKey } = editingCell;
    setEditingCell(null);
    setEditValue("");
    await handleSaveValue(docId, columnKey, valueToSave);
  };

  const handleEditCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleRunProcessor = async (docId: string, columnId: string) => {
    const cellKey = `${docId}-${columnId}`;
    setRunningCells((prev) => new Set(prev).add(cellKey));

    try {
      await triggerProcessorRun(projectId, docId, columnId);
      // Wait a bit then refresh
      setTimeout(onRefresh, 1000);
    } finally {
      setRunningCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  const handleRedownloadUrl = async (docId: string) => {
    setRunningCells((prev) => new Set(prev).add(`${docId}-redownload`));

    try {
      await redownloadUrl(projectId, docId);
      // Wait a bit then refresh
      setTimeout(onRefresh, 1000);
    } finally {
      setRunningCells((prev) => {
        const next = new Set(prev);
        next.delete(`${docId}-redownload`);
        return next;
      });
    }
  };

  const getCellValue = (doc: Document, columnKey: string): string => {
    const values = (doc.values as Record<string, unknown>) || {};
    return formatCellValue(values[columnKey]);
  };

  const formatCellValue = (value: unknown): string => {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const preview = value
        .slice(0, 10)
        .map((item) =>
          typeof item === "string" ? item : JSON.stringify(item),
        )
        .join(", ");
      return value.length > 10 ? `${preview}…` : preview;
    }
    return JSON.stringify(value);
  };

  const makeCellKey = (docId: string, columnKey: string) =>
    `${docId}::${columnKey}`;

  const handleSaveValue = async (
    docId: string,
    columnKey: string,
    value: unknown,
  ) => {
    const cellKey = makeCellKey(docId, columnKey);
    setOptimisticValues((prev) => ({ ...prev, [cellKey]: value }));
    setSavingCells((prev) => new Set(prev).add(cellKey));

    const result = await updateDocumentValue(
      projectId,
      docId,
      columnKey,
      value,
    );

    setSavingCells((prev) => {
      const next = new Set(prev);
      next.delete(cellKey);
      return next;
    });

    if (result?.error) {
      setOptimisticValues((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
      return false;
    }

    onRefresh();
    return true;
  };

  const handleArrayEditStart = (doc: Document, column: Column) => {
    const values = (doc.values as Record<string, unknown>) || {};
    const value = values[column.key];
    const normalizedValues = Array.isArray(value)
      ? value
          .map((item) =>
            column.type === "number_array" && typeof item === "number"
              ? String(item)
              : typeof item === "string"
                ? item
                : item === null || item === undefined
                  ? ""
                  : String(item),
          )
          .filter((item) => item.length > 0)
      : [];
    setArrayEditError(null);
    setArrayEditState({
      docId: doc.id,
      column,
      values: normalizedValues,
    });
  };

  const handleArrayEditValueChange = (index: number, value: string) => {
    setArrayEditState((prev) => {
      if (!prev) return prev;
      const nextValues = [...prev.values];
      nextValues[index] = value;
      return { ...prev, values: nextValues };
    });
  };

  const handleArrayEditAddValue = (defaultValue: string) => {
    setArrayEditState((prev) => {
      if (!prev) return prev;
      return { ...prev, values: [...prev.values, defaultValue] };
    });
  };

  const handleArrayEditRemoveValue = (index: number) => {
    setArrayEditState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        values: prev.values.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleArrayEditSave = async () => {
    if (!arrayEditState) return;
    const { docId, column, values } = arrayEditState;
    const trimmedValues = values.map((value) => value.trim());
    const preparedValue =
      column.type === "number_array"
        ? trimmedValues
            .filter((value) => value.length > 0)
            .map((value) => Number(value))
            .filter((value) => !Number.isNaN(value))
        : trimmedValues.filter((value) => value.length > 0);
    const success = await handleSaveValue(docId, column.key, preparedValue);
    if (success) {
      setArrayEditState(null);
    } else {
      setArrayEditError("Failed to save array values. Please try again.");
    }
  };

  const getRunStatus = (
    doc: DocumentWithRuns,
    columnKey: string,
  ): { status: RunStatus; error: string | null } | null => {
    if (!doc.latestRuns) return null;
    return doc.latestRuns[columnKey] || null;
  };

  const getUploaderLabel = (doc: DocumentWithRuns) =>
    doc.uploadedBy?.name || doc.uploadedBy?.email || "Unknown";

  const handleSort = (type: SortState["type"], key: string) => {
    setSortState((prev) => {
      if (prev.type === type && prev.key === key) {
        return {
          ...prev,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        type,
        key: key as SortState["key"],
        direction: "asc",
      } as SortState;
    });
  };

  const getSortValue = (
    doc: DocumentWithRuns,
    state: SortState,
  ): string | number => {
    if (state.type === "base") {
      switch (state.key) {
        case "title":
          return doc.title || "";
        case "source":
          return doc.sourceType === "url" ? doc.sourceUrl || "" : "Upload";
        case "uploader":
          return getUploaderLabel(doc);
        case "created":
          return doc.createdAt instanceof Date
            ? doc.createdAt.getTime()
            : new Date(doc.createdAt).getTime();
        default:
          return "";
      }
    }

    return getCellValue(doc, state.key);
  };

  useEffect(() => {
    if (Object.keys(optimisticValues).length === 0) return;

    setOptimisticValues((prev) => {
      const next = { ...prev };
      let didChange = false;
      Object.entries(prev).forEach(([cellKey, optimisticValue]) => {
        const [docId, columnKey] = cellKey.split("::");
        const doc = documents.find((item) => item.id === docId);
        if (!doc) {
          delete next[cellKey];
          didChange = true;
          return;
        }
        const values = (doc.values as Record<string, unknown>) || {};
        const actualValue = values[columnKey];
        if (JSON.stringify(actualValue) === JSON.stringify(optimisticValue)) {
          delete next[cellKey];
          didChange = true;
        }
      });
      return didChange ? next : prev;
    });
  }, [documents, optimisticValues]);

  const sortedDocuments = useMemo(() => {
    const sorted = [...documents];
    sorted.sort((a, b) => {
      const valueA = getSortValue(a, sortState);
      const valueB = getSortValue(b, sortState);

      if (valueA === valueB) return 0;
      if (valueA === "" || valueA === null || valueA === undefined) return 1;
      if (valueB === "" || valueB === null || valueB === undefined) return -1;

      let comparison = 0;
      if (typeof valueA === "number" && typeof valueB === "number") {
        comparison = valueA - valueB;
      } else {
        comparison = String(valueA).localeCompare(String(valueB), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }

      return sortState.direction === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [documents, sortState]);

  const getHeaderCellClass = (isSorted: boolean) =>
    [
      "table__header-cell",
      "table__header-cell--sortable",
      isSorted ? "table__header-cell--sorted" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const getSortIcon = (isSorted: boolean) => {
    if (!isSorted) {
      // return <span className="table__header-cell__sort-icon">↕</span>;
      return;
    }

    return (
      <span className="table__header-cell__sort-icon">
        {sortState.direction === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const getAriaSort = (isSorted: boolean) => {
    if (!isSorted) return "none";
    return sortState.direction === "asc" ? "ascending" : "descending";
  };

  if (documents.length === 0) {
    return (
      <div className="table__empty">
        <svg className="table__empty__icon" viewBox="0 0 48 48" fill="none">
          <path
            d="M8 12h32M8 24h32M8 36h20"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <div className="table__empty__title">No documents yet</div>
        <div className="table__empty__description">
          Upload a PDF or add a URL to get started with your knowledge table.
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      {(hiddenColumns.length > 0 || hiddenBaseColumnEntries.length > 0) && (
        <div className="table__hidden-columns">
          <span className="table__hidden-columns__label">Hidden columns:</span>
          <div className="table__hidden-columns__list">
            {hiddenBaseColumnEntries.map((column) => (
              <div key={column.key} className="table__hidden-columns__chip">
                <span>{column.label}</span>
                <button
                  type="button"
                  className="table__column-menu__trigger"
                  onClick={() => handleShowBaseColumn(column.key)}
                >
                  Show
                </button>
              </div>
            ))}
            {hiddenColumns.map((column) => (
              <div key={column.id} className="table__hidden-columns__chip">
                <span>{column.name}</span>
                {onEditColumn && (
                  <button
                    type="button"
                    className="table__column-menu__trigger"
                    onClick={() => onEditColumn(column)}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className="table__column-menu__trigger"
                  onClick={() => handleShowColumn(column.id)}
                >
                  Show
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <table className="table">
        <thead className="table__header">
          <tr className="table__header-row">
            {isBaseColumnVisible("title") && (
              <th
                className={getHeaderCellClass(
                  sortState.type === "base" && sortState.key === "title",
                )}
                aria-sort={getAriaSort(
                  sortState.type === "base" && sortState.key === "title",
                )}
              >
                <div className="table__header-cell__content">
                  <div className="table__column-menu">
                    <button
                      type="button"
                      className="table__header-cell__sort-button"
                      onClick={() => onSort("base", "title")}
                    >
                      <span>Title</span>
                      {getSortIcon(
                        sortState.type === "base" && sortState.key === "title",
                      )}
                    </button>
                    <button
                      type="button"
                      className="table__column-menu__trigger"
                      onClick={() => handleHideBaseColumn("title")}
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </th>
            )}
            {isBaseColumnVisible("source") && (
              <th
                className={getHeaderCellClass(
                  sortState.type === "base" && sortState.key === "source",
                )}
                aria-sort={getAriaSort(
                  sortState.type === "base" && sortState.key === "source",
                )}
              >
                <div className="table__header-cell__content">
                  <div className="table__column-menu">
                    <button
                      type="button"
                      className="table__header-cell__sort-button"
                      onClick={() => onSort("base", "source")}
                    >
                      <span>Source</span>
                      {getSortIcon(
                        sortState.type === "base" && sortState.key === "source",
                      )}
                    </button>
                    <button
                      type="button"
                      className="table__column-menu__trigger"
                      onClick={() => handleHideBaseColumn("source")}
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </th>
            )}
            {isBaseColumnVisible("uploader") && (
              <th
                className={getHeaderCellClass(
                  sortState.type === "base" && sortState.key === "uploader",
                )}
                aria-sort={getAriaSort(
                  sortState.type === "base" && sortState.key === "uploader",
                )}
              >
                <div className="table__header-cell__content">
                  <div className="table__column-menu">
                    <button
                      type="button"
                      className="table__header-cell__sort-button"
                      onClick={() => onSort("base", "uploader")}
                    >
                      <span>Uploader</span>
                      {getSortIcon(
                        sortState.type === "base" &&
                          sortState.key === "uploader",
                      )}
                    </button>
                    <button
                      type="button"
                      className="table__column-menu__trigger"
                      onClick={() => handleHideBaseColumn("uploader")}
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </th>
            )}
            {isBaseColumnVisible("created") && (
              <th
                className={getHeaderCellClass(
                  sortState.type === "base" && sortState.key === "created",
                )}
                aria-sort={getAriaSort(
                  sortState.type === "base" && sortState.key === "created",
                )}
              >
                <div className="table__header-cell__content">
                  <div className="table__column-menu">
                    <button
                      type="button"
                      className="table__header-cell__sort-button"
                      onClick={() => onSort("base", "created")}
                    >
                      <span>Created</span>
                      {getSortIcon(
                        sortState.type === "base" &&
                          sortState.key === "created",
                      )}
                    </button>
                    <button
                      type="button"
                      className="table__column-menu__trigger"
                      onClick={() => handleHideBaseColumn("created")}
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </th>
            )}
            {visibleColumns.map((column) => (
              <th
                key={column.id}
                className={getHeaderCellClass(
                  sortState.type === "column" && sortState.key === column.key,
                )}
                aria-sort={getAriaSort(
                  sortState.type === "column" && sortState.key === column.key,
                )}
              >
                <div className="table__header-cell__content">
                  <div className="table__column-menu">
                    <button
                      type="button"
                      className="table__header-cell__sort-button"
                      onClick={() => onSort("column", column.key)}
                    >
                      <span>{column.name}</span>
                      {getSortIcon(
                        sortState.type === "column" &&
                          sortState.key === column.key,
                      )}
                    </button>
                    {onEditColumn && (
                      <button
                        type="button"
                        className="table__column-menu__trigger"
                        onClick={() => onEditColumn(column)}
                      >
                        Edit
                      </button>
                    )}
                    {onDeleteColumn && (
                      <button
                        type="button"
                        className="table__column-menu__trigger"
                        onClick={() => onDeleteColumn(column)}
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      className="table__column-menu__trigger"
                      onClick={() => handleHideColumn(column.id)}
                    >
                      Hide
                    </button>
                  </div>
                  <span
                    className={`table__header-cell__badge table__header-cell__badge--${column.mode}`}
                  >
                    {column.mode}
                  </span>
                </div>
              </th>
            ))}
            <th className="table__header-cell table__header-cell--sticky-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="table__body">
          {sortedDocuments.map((doc) => (
            <tr key={doc.id} className="table__row">
              {isBaseColumnVisible("title") && (
                <td className="table__cell">
                  <div className="table__cell__layout">
                    <div className="table__cell__main">
                      {(() => {
                        const values =
                          (doc.values as Record<string, unknown>) || {};
                        const thumbnailValue = values[PDF_THUMBNAIL_COLUMN_KEY];
                        const hasThumbnail =
                          typeof thumbnailValue === "string" &&
                          thumbnailValue.length > 0;

                        if (!hasThumbnail) {
                          return null;
                        }

                        return (
                          <img
                            src={getDocumentThumbnailUrl(projectId, doc.id)}
                            alt=""
                            className="table__cell__thumbnail"
                            loading="lazy"
                            aria-hidden="true"
                          />
                        );
                      })()}
                      <span className="table__cell__value">{doc.title}</span>
                    </div>
                    <div className="table__cell__footer">
                      {(() => {
                        if (doc.sourceType !== "url") {
                          return (
                            <button
                              type="button"
                              className="table__cell__copy"
                              onClick={() => handleCopy(doc.title)}
                              aria-label="Copy title"
                            >
                              Copy
                            </button>
                          );
                        }

                        const htmlSourceRun = getRunStatus(doc, "html_source");
                        const isRedownloadRunning = runningCells.has(
                          `${doc.id}-redownload`,
                        );
                        const displayStatus = isRedownloadRunning
                          ? "running"
                          : htmlSourceRun?.status;

                        return (
                          <>
                            <RunStatusBadge
                              status={displayStatus || "pending"}
                            />
                            <div className="table__cell__footer-actions">
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={isRedownloadRunning}
                                disabled={
                                  displayStatus === "queued" ||
                                  displayStatus === "running"
                                }
                                onClick={() => handleRedownloadUrl(doc.id)}
                                title={
                                  htmlSourceRun
                                    ? "Rerun HTML download"
                                    : "Download HTML source"
                                }
                              >
                                {displayStatus === "queued"
                                  ? "⏳"
                                  : displayStatus === "running"
                                    ? "⚙️"
                                    : htmlSourceRun
                                      ? "🔄"
                                      : "▶️"}
                              </Button>
                              <button
                                type="button"
                                className="table__cell__copy"
                                onClick={() => handleCopy(doc.title)}
                                aria-label="Copy title"
                              >
                                Copy
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </td>
              )}
              {isBaseColumnVisible("source") && (
                <td className="table__cell">
                  <div className="table__cell__layout">
                    <div className="table__cell__main">
                      <span className="table__cell__value">
                        {doc.sourceType === "url" ? (
                          <a
                            href={doc.sourceUrl || "#"}
                            target="_blank"
                            rel="noopener"
                          >
                            {doc.sourceUrl
                              ? new URL(doc.sourceUrl).hostname
                              : "URL"}
                          </a>
                        ) : (
                          "Upload"
                        )}
                      </span>
                    </div>
                    <div className="table__cell__footer">
                      <button
                        type="button"
                        className="table__cell__copy"
                        onClick={() =>
                          handleCopy(
                            doc.sourceUrl ||
                              (doc.sourceType === "url" ? "URL" : "Upload"),
                          )
                        }
                        aria-label="Copy source"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </td>
              )}
              {isBaseColumnVisible("uploader") && (
                <td className="table__cell">
                  <div className="table__cell__layout">
                    <div className="table__cell__main">
                      <span className="table__cell__value">
                        {getUploaderLabel(doc)}
                      </span>
                    </div>
                    <div className="table__cell__footer">
                      <button
                        type="button"
                        className="table__cell__copy"
                        onClick={() => handleCopy(getUploaderLabel(doc))}
                        aria-label="Copy uploader"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </td>
              )}
              {isBaseColumnVisible("created") && (
                <td className="table__cell">
                  <div className="table__cell__layout">
                    <div className="table__cell__main">
                      <span className="table__cell__value">
                        {formatDateTime(doc.createdAt)}
                      </span>
                    </div>
                    <div className="table__cell__footer">
                      <button
                        type="button"
                        className="table__cell__copy"
                        onClick={() =>
                          handleCopy(formatDateTime(doc.createdAt))
                        }
                        aria-label="Copy created date"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </td>
              )}
              {visibleColumns.map((column) => {
                const isEditing =
                  editingCell?.docId === doc.id &&
                  editingCell?.columnKey === column.key;
                const cellKey = `${doc.id}-${column.id}`;
                const isRunning = runningCells.has(cellKey);
                const runInfo = getRunStatus(doc, column.key);
                const manualCellKey = makeCellKey(doc.id, column.key);
                const hasOptimisticValue = Object.prototype.hasOwnProperty.call(
                  optimisticValues,
                  manualCellKey,
                );
                const documentValues =
                  (doc.values as Record<string, unknown>) || {};
                const optimisticValue = hasOptimisticValue
                  ? optimisticValues[manualCellKey]
                  : undefined;
                const resolvedValue = hasOptimisticValue
                  ? optimisticValue
                  : documentValues[column.key];
                const cellValue = formatCellValue(resolvedValue);
                const isSaving = savingCells.has(manualCellKey);
                const isArrayType =
                  column.type === "text_array" ||
                  column.type === "number_array";

                if (column.mode === "manual") {
                  return (
                    <td
                      key={column.id}
                      className={`table__cell table__cell--editable ${
                        isEditing ? "table__cell--editing" : ""
                      }`}
                      onClick={() =>
                        !isEditing &&
                        (isArrayType
                          ? handleArrayEditStart(doc, column)
                          : handleEditStart(doc, column))
                      }
                    >
                      {isEditing ? (
                        <div style={{ display: "flex", gap: "4px" }}>
                          <input
                            type="text"
                            className="table__cell__input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave();
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            autoFocus
                          />
                          <Button size="sm" onClick={handleEditSave}>
                            Save
                          </Button>
                        </div>
                      ) : (
                        <div className="table__cell__layout">
                          <div className="table__cell__main">
                            <span className="table__cell__value">
                              {cellValue || "—"}
                            </span>
                          </div>
                          <div className="table__cell__footer">
                            {isSaving ? (
                              <span className="table__cell__status">
                                Saving...
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="table__cell__copy"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleCopy(cellValue);
                                }}
                                aria-label={`Copy ${column.name}`}
                              >
                                Copy
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                }

                // Processor column
                const displayStatus = isRunning ? "running" : runInfo?.status;

                return (
                  <td
                    key={column.id}
                    className={`table__cell table__cell--processor ${displayStatus ? `table__cell--${displayStatus}` : ""}`}
                  >
                    <div className="table__cell__layout">
                      {/* Line 1: Value or error */}
                      <div className="table__cell__main">
                        {cellValue ? (
                          <span
                            className="table__cell__value"
                            title={cellValue}
                          >
                            {cellValue}
                          </span>
                        ) : runInfo?.error ? (
                          <span
                            className="table__cell__error"
                            title={runInfo.error}
                          >
                            {runInfo.error}
                          </span>
                        ) : (
                          <span className="table__cell__value table__cell__value--placeholder">
                            Not processed
                          </span>
                        )}
                      </div>

                      {/* Line 2: Status + Actions */}
                      <div className="table__cell__footer">
                        <RunStatusBadge status={displayStatus || "pending"} />
                        <div className="table__cell__footer-actions">
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={isRunning}
                            disabled={
                              displayStatus === "queued" ||
                              displayStatus === "running"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunProcessor(doc.id, column.id);
                            }}
                            title={
                              runInfo
                                ? `Rerun ${column.name}`
                                : `Run ${column.name}`
                            }
                          >
                            {displayStatus === "queued"
                              ? "⏳"
                              : displayStatus === "running"
                                ? "⚙️"
                                : runInfo
                                  ? "🔄"
                                  : "▶️"}
                          </Button>
                          <button
                            type="button"
                            className="table__cell__copy"
                            onClick={() => handleCopy(cellValue)}
                            aria-label={`Copy ${column.name}`}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                );
              })}
              <td className="table__cell table__cell--sticky-right">
                <div className="table__cell__actions table__cell__actions--vertical">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDetailDocument(doc)}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeleteDocument?.(doc)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ManualArrayEditorModal
        state={arrayEditState}
        error={arrayEditError}
        isSaving={
          arrayEditState
            ? savingCells.has(
                makeCellKey(arrayEditState.docId, arrayEditState.column.key),
              )
            : false
        }
        onClose={() => {
          setArrayEditState(null);
          setArrayEditError(null);
        }}
        onChangeValue={handleArrayEditValueChange}
        onRemoveValue={handleArrayEditRemoveValue}
        onAddValue={handleArrayEditAddValue}
        onSave={handleArrayEditSave}
      />
      <DocumentDetailModal
        document={detailDocument}
        columns={columns}
        open={Boolean(detailDocument)}
        onOpenChange={(open) => {
          if (!open) setDetailDocument(null);
        }}
      />
    </div>
  );
}

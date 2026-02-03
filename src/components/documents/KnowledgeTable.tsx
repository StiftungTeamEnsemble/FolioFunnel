"use client";

import { useMemo, useState } from "react";
import { Column, Document, RunStatus } from "@prisma/client";
import { Button } from "@/components/ui";
import { updateDocumentValue } from "@/app/actions/documents";
import { updateColumnVisibility } from "@/app/actions/columns";
import { triggerProcessorRun, redownloadUrl } from "@/app/actions/runs";
import { DocumentDetailModal } from "@/components/documents/DocumentDetailModal";
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

type BaseColumnKey = (typeof BASE_COLUMNS)[number]["key"];
type SortDirection = "asc" | "desc";
type SortState =
  | { type: "base"; key: BaseColumnKey; direction: SortDirection }
  | { type: "column"; key: string; direction: SortDirection };

export function KnowledgeTable({
  projectId,
  documents,
  columns,
  onRefresh,
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
  const [detailDocument, setDetailDocument] = useState<DocumentWithRuns | null>(
    null,
  );
  const [hiddenBaseColumns, setHiddenBaseColumns] = useState<Set<string>>(
    new Set(),
  );
  const [sortState, setSortState] = useState<SortState>({
    type: "base",
    key: "created",
    direction: "desc",
  });

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

  const handleEditStart = (doc: Document, columnKey: string) => {
    const values = (doc.values as Record<string, unknown>) || {};
    const value = values[columnKey];
    setEditValue(
      typeof value === "string" ? value : JSON.stringify(value ?? ""),
    );
    setEditingCell({ docId: doc.id, columnKey });
  };

  const handleEditSave = async () => {
    if (!editingCell) return;

    await updateDocumentValue(
      projectId,
      editingCell.docId,
      editingCell.columnKey,
      editValue,
    );
    setEditingCell(null);
    onRefresh();
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
    const value = values[columnKey];
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return `[${value.length} items]`;
    return JSON.stringify(value);
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
      return <span className="table__header-cell__sort-icon">↕</span>;
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
                      onClick={() => handleSort("base", "title")}
                    >
                      <span>Title</span>
                      {getSortIcon(
                        sortState.type === "base" &&
                          sortState.key === "title",
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
                      onClick={() => handleSort("base", "source")}
                    >
                      <span>Source</span>
                      {getSortIcon(
                        sortState.type === "base" &&
                          sortState.key === "source",
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
                      onClick={() => handleSort("base", "uploader")}
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
                      onClick={() => handleSort("base", "created")}
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
                      onClick={() => handleSort("column", column.key)}
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
                const cellValue = getCellValue(doc, column.key);

                if (column.mode === "manual") {
                  return (
                    <td
                      key={column.id}
                      className={`table__cell table__cell--editable ${
                        isEditing ? "table__cell--editing" : ""
                      }`}
                      onClick={() =>
                        !isEditing && handleEditStart(doc, column.key)
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

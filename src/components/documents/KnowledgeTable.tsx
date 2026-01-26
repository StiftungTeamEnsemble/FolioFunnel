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
import "@/styles/components/table.css";

interface DocumentWithRuns extends Document {
  latestRuns?: Record<
    string,
    {
      status: RunStatus;
      error: string | null;
    }
  >;
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
  const [detailDocument, setDetailDocument] = useState<Document | null>(null);

  const visibleColumns = useMemo(
    () => columns.filter((column) => !column.hidden),
    [columns],
  );

  const hiddenColumns = useMemo(
    () => columns.filter((column) => column.hidden),
    [columns],
  );

  const handleHideColumn = async (columnId: string) => {
    await updateColumnVisibility(projectId, columnId, true);
    onRefresh();
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
      {hiddenColumns.length > 0 && (
        <div className="table__hidden-columns">
          <span className="table__hidden-columns__label">Hidden columns:</span>
          <div className="table__hidden-columns__list">
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
            <th className="table__header-cell">Title</th>
            <th className="table__header-cell">Source</th>
            <th className="table__header-cell">Created</th>
            {visibleColumns.map((column) => (
              <th key={column.id} className="table__header-cell">
                <div className="table__header-cell__content">
                  <div className="table__column-menu">
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
          {documents.map((doc) => (
            <tr key={doc.id} className="table__row">
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
                    <button
                      type="button"
                      className="table__cell__copy"
                      onClick={() => handleCopy(doc.title)}
                      aria-label="Copy title"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </td>
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
              <td className="table__cell">
                <div className="table__cell__layout">
                  <div className="table__cell__main">
                    <span className="table__cell__value">
                      {new Date(doc.createdAt).toISOString().split("T")[0]}
                    </span>
                  </div>
                  <div className="table__cell__footer">
                    <button
                      type="button"
                      className="table__cell__copy"
                      onClick={() =>
                        handleCopy(
                          new Date(doc.createdAt).toISOString().split("T")[0],
                        )
                      }
                      aria-label="Copy created date"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </td>
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
                        <div className="table__cell__status">
                          <StatusIcon status={displayStatus || "pending"} />
                          <span className="table__cell__status-label">
                            Status:{" "}
                            {displayStatus === "running" && "Processing"}
                            {displayStatus === "queued" && "Queued"}
                            {displayStatus === "success" && "Done"}
                            {displayStatus === "error" && "Error"}
                            {!displayStatus && "Not run"}
                          </span>
                        </div>
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
                  {doc.sourceType === "url" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRedownloadUrl(doc.id)}
                      isLoading={runningCells.has(`${doc.id}-redownload`)}
                    >
                      Re-download
                    </Button>
                  )}
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

function StatusIcon({ status }: { status: RunStatus | "running" | "pending" }) {
  const getClassName = () => {
    switch (status) {
      case "queued":
        return "table__cell__status-icon table__cell__status-icon--queued";
      case "running":
        return "table__cell__status-icon table__cell__status-icon--running";
      case "success":
        return "table__cell__status-icon table__cell__status-icon--success";
      case "error":
        return "table__cell__status-icon table__cell__status-icon--error";
      case "pending":
        return "table__cell__status-icon table__cell__status-icon--pending";
      default:
        return "table__cell__status-icon";
    }
  };

  const getIcon = () => {
    switch (status) {
      case "pending":
        return (
          <svg viewBox="0 0 16 16" fill="none">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
          </svg>
        );
      case "queued":
        return (
          <svg viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
          </svg>
        );
      case "running":
        return (
          <svg viewBox="0 0 16 16" fill="none" className="spinning">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="24"
              strokeDashoffset="8"
            />
          </svg>
        );
      case "success":
        return (
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8l3 3 7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case "error":
        return (
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M12 4L4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return <div className={getClassName()}>{getIcon()}</div>;
}

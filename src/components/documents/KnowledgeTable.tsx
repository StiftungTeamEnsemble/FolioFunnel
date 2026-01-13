'use client';

import { useState, useCallback } from 'react';
import { Column, Document, ProcessorRun, RunStatus } from '@prisma/client';
import { Button } from '@/components/ui';
import { updateDocumentValue } from '@/app/actions/documents';
import { triggerProcessorRun } from '@/app/actions/runs';
import '@/styles/components/table.css';

interface DocumentWithRuns extends Document {
  latestRuns?: Record<string, {
    status: RunStatus;
    error: string | null;
  }>;
}

interface KnowledgeTableProps {
  projectId: string;
  documents: DocumentWithRuns[];
  columns: Column[];
  onRefresh: () => void;
}

export function KnowledgeTable({
  projectId,
  documents,
  columns,
  onRefresh,
}: KnowledgeTableProps) {
  const [editingCell, setEditingCell] = useState<{
    docId: string;
    columnKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());

  const handleEditStart = (doc: Document, columnKey: string) => {
    const values = (doc.values as Record<string, unknown>) || {};
    const value = values[columnKey];
    setEditValue(typeof value === 'string' ? value : JSON.stringify(value ?? ''));
    setEditingCell({ docId: doc.id, columnKey });
  };

  const handleEditSave = async () => {
    if (!editingCell) return;

    await updateDocumentValue(
      projectId,
      editingCell.docId,
      editingCell.columnKey,
      editValue
    );
    setEditingCell(null);
    onRefresh();
  };

  const handleEditCancel = () => {
    setEditingCell(null);
    setEditValue('');
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

  const getCellValue = (doc: Document, columnKey: string): string => {
    const values = (doc.values as Record<string, unknown>) || {};
    const value = values[columnKey];
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `[${value.length} items]`;
    return JSON.stringify(value);
  };

  const getRunStatus = (
    doc: DocumentWithRuns,
    columnKey: string
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
      <table className="table">
        <thead className="table__header">
          <tr className="table__header-row">
            <th className="table__header-cell">Title</th>
            <th className="table__header-cell">Source</th>
            <th className="table__header-cell">Created</th>
            {columns.map((column) => (
              <th key={column.id} className="table__header-cell">
                <div className="table__header-cell__content">
                  <span>{column.name}</span>
                  <span
                    className={`table__header-cell__badge table__header-cell__badge--${column.mode}`}
                  >
                    {column.mode}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="table__body">
          {documents.map((doc) => (
            <tr key={doc.id} className="table__row">
              <td className="table__cell">{doc.title}</td>
              <td className="table__cell">
                {doc.sourceType === 'url' ? (
                  <a href={doc.sourceUrl || '#'} target="_blank" rel="noopener">
                    {doc.sourceUrl
                      ? new URL(doc.sourceUrl).hostname
                      : 'URL'}
                  </a>
                ) : (
                  'Upload'
                )}
              </td>
              <td className="table__cell">
                {new Date(doc.createdAt).toLocaleDateString()}
              </td>
              {columns.map((column) => {
                const isEditing =
                  editingCell?.docId === doc.id &&
                  editingCell?.columnKey === column.key;
                const cellKey = `${doc.id}-${column.id}`;
                const isRunning = runningCells.has(cellKey);
                const runInfo = getRunStatus(doc, column.key);

                if (column.mode === 'manual') {
                  return (
                    <td
                      key={column.id}
                      className={`table__cell table__cell--editable ${
                        isEditing ? 'table__cell--editing' : ''
                      }`}
                      onClick={() =>
                        !isEditing && handleEditStart(doc, column.key)
                      }
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input
                            type="text"
                            className="table__cell__input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditSave();
                              if (e.key === 'Escape') handleEditCancel();
                            }}
                            autoFocus
                          />
                          <Button size="sm" onClick={handleEditSave}>
                            Save
                          </Button>
                        </div>
                      ) : (
                        <span className="table__cell__value">
                          {getCellValue(doc, column.key) || '—'}
                        </span>
                      )}
                    </td>
                  );
                }

                // Processor column
                return (
                  <td key={column.id} className="table__cell table__cell--processor">
                    <div className="table__cell__processor-status">
                      {runInfo && (
                        <StatusIcon status={isRunning ? 'running' : runInfo.status} />
                      )}
                      <span className="table__cell__value">
                        {getCellValue(doc, column.key) || (
                          <span style={{ color: 'var(--color-gray-400)' }}>
                            {runInfo?.error || 'Not processed'}
                          </span>
                        )}
                      </span>
                      <div className="table__cell__actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={isRunning}
                          onClick={() => handleRunProcessor(doc.id, column.id)}
                        >
                          {runInfo ? 'Rerun' : 'Run'}
                        </Button>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusIcon({ status }: { status: RunStatus | 'running' }) {
  const getClassName = () => {
    switch (status) {
      case 'queued':
        return 'table__cell__status-icon table__cell__status-icon--queued';
      case 'running':
        return 'table__cell__status-icon table__cell__status-icon--running';
      case 'success':
        return 'table__cell__status-icon table__cell__status-icon--success';
      case 'error':
        return 'table__cell__status-icon table__cell__status-icon--error';
      default:
        return 'table__cell__status-icon';
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'queued':
        return (
          <svg viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
          </svg>
        );
      case 'running':
        return (
          <svg viewBox="0 0 16 16" fill="none">
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
      case 'success':
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
      case 'error':
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

"use client";

import { Column, Document } from "@prisma/client";
import { Modal, ModalContent } from "@/components/ui";
import { formatDateTime } from "@/lib/date-time";
import "@/styles/components/table.css";

interface DocumentWithUploader extends Document {
  uploadedBy?: { name: string | null; email: string | null } | null;
}

interface DocumentDetailModalProps {
  document: DocumentWithUploader | null;
  columns: Column[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
};

export function DocumentDetailModal({
  document,
  columns,
  open,
  onOpenChange,
}: DocumentDetailModalProps) {
  if (!document) return null;

  const values = (document.values as Record<string, unknown>) || {};
  const columnKeys = new Set(columns.map((column) => column.key));
  const extraKeys = Object.keys(values).filter((key) => !columnKeys.has(key));

  const sourceLabel =
    document.sourceType === "url"
      ? document.sourceUrl || "URL"
      : document.filePath || "Upload";
  const uploaderLabel =
    document.uploadedBy?.name || document.uploadedBy?.email || "Unknown";

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Document details"
        description={document.title}
        size="lg"
      >
        <div className="document-detail">
          <div className="document-detail__section">
            <h4 className="document-detail__section-title">Metadata</h4>
            <dl className="document-detail__list">
              <div className="document-detail__row">
                <dt>Title</dt>
                <dd>{document.title}</dd>
              </div>
              <div className="document-detail__row">
                <dt>Source</dt>
                <dd>{sourceLabel}</dd>
              </div>
              <div className="document-detail__row">
                <dt>Uploader</dt>
                <dd>{uploaderLabel}</dd>
              </div>
              <div className="document-detail__row">
                <dt>Created</dt>
                <dd>
                  {formatDateTime(document.createdAt)}
                </dd>
              </div>
              <div className="document-detail__row">
                <dt>Updated</dt>
                <dd>
                  {formatDateTime(document.updatedAt)}
                </dd>
              </div>
              {document.mimeType && (
                <div className="document-detail__row">
                  <dt>MIME Type</dt>
                  <dd>{document.mimeType}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="document-detail__section">
            <h4 className="document-detail__section-title">Fields</h4>
            <dl className="document-detail__list">
              {columns.map((column) => (
                <div key={column.id} className="document-detail__row">
                  <dt>
                    {column.name}
                    <span className="document-detail__key">{column.key}</span>
                  </dt>
                  <dd>
                    <pre>{formatValue(values[column.key])}</pre>
                  </dd>
                </div>
              ))}
              {extraKeys.map((key) => (
                <div key={key} className="document-detail__row">
                  <dt>
                    {key}
                    <span className="document-detail__key">Custom field</span>
                  </dt>
                  <dd>
                    <pre>{formatValue(values[key])}</pre>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

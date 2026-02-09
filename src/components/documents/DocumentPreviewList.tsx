"use client";

import { useState } from "react";
import type { Document } from "@prisma/client";
import { Button } from "@/components/ui";
import {
  getDocumentThumbnailUrl,
  PDF_THUMBNAIL_COLUMN_KEY,
} from "@/lib/thumbnails";
import { formatDateTime } from "@/lib/date-time";
import "@/styles/components/table.css";

interface DocumentPreviewListProps {
  documents: Document[];
  projectId: string;
  label?: string;
  initialExpanded?: boolean;
}

const getSourceLabel = (doc: Document) => {
  if (doc.sourceType === "url") {
    return doc.sourceUrl || "URL";
  }
  return doc.filePath || "Upload";
};

export function DocumentPreviewList({
  documents,
  projectId,
  label = "Documents",
  initialExpanded = false,
}: DocumentPreviewListProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const countLabel = `${documents.length} document${
    documents.length !== 1 ? "s" : ""
  }`;

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span>
          <strong>{label}:</strong> {countLabel}
        </span>
        {documents.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? "Hide list" : "View list"}
          </Button>
        )}
      </div>
      {isExpanded && documents.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: "10px",
            maxHeight: "240px",
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {documents.map((doc) => {
            const values = (doc.values as Record<string, unknown>) || {};
            const thumbnailValue = values[PDF_THUMBNAIL_COLUMN_KEY];
            const hasThumbnail =
              typeof thumbnailValue === "string" && thumbnailValue.length > 0;

            return (
              <div
                key={doc.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                {hasThumbnail && (
                  <img
                    src={getDocumentThumbnailUrl(projectId, doc.id)}
                    alt=""
                    className="table__cell__thumbnail"
                    loading="lazy"
                    aria-hidden="true"
                  />
                )}
                <div style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontWeight: 600 }}>{doc.title}</span>
                  <span
                    style={{ fontSize: "12px", color: "var(--color-gray-500)" }}
                  >
                    {getSourceLabel(doc)} · {formatDateTime(doc.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

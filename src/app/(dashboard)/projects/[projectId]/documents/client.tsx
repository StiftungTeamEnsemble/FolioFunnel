"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Project, Document, Column } from "@prisma/client";
import { Button, Select, SelectItem } from "@/components/ui";
import { DocumentSelection } from "@/components/documents/DocumentSelection";
import { KnowledgeTable } from "@/components/documents/KnowledgeTable";
import { AddDocumentModal } from "@/components/documents/AddDocumentModal";
import { ColumnModal } from "@/components/documents/ColumnModal";
import { DeleteColumnModal } from "@/components/documents/DeleteColumnModal";
import { DeleteDocumentModal } from "@/components/documents/DeleteDocumentModal";
import { triggerBulkProcessorRun } from "@/app/actions/runs";
import type { FilterGroup } from "@/lib/document-filters";
import { formatDateTime } from "@/lib/date-time";

interface DocumentWithRuns extends Document {
  latestRuns?: Record<string, { status: string; error: string | null }>;
  uploadedBy?: { name: string | null; email: string | null } | null;
}

interface ProjectDocumentsClientProps {
  project: Project;
  initialDocuments: DocumentWithRuns[];
  initialColumns: Column[];
}

export function ProjectDocumentsClient({
  project,
  initialDocuments,
  initialColumns,
}: ProjectDocumentsClientProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [columns, setColumns] = useState(initialColumns);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [bulkRunningColumn, setBulkRunningColumn] = useState<string | null>(
    null,
  );
  const [selectedBulkColumn, setSelectedBulkColumn] = useState<string>("");
  const [selectedCopyColumn, setSelectedCopyColumn] = useState<string>("");
  const [columnToEdit, setColumnToEdit] = useState<Column | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<Column | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(
    null,
  );
  const [filteredDocuments, setFilteredDocuments] =
    useState<DocumentWithRuns[]>(initialDocuments);
  const [filters, setFilters] = useState<FilterGroup[]>([]);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    setFilteredDocuments(documents);
  }, [documents]);

  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleBulkRun = async (columnId: string) => {
    setBulkRunningColumn(columnId);
    try {
      await triggerBulkProcessorRun(project.id, columnId, filters);
      setTimeout(handleRefresh, 2000);
    } finally {
      setBulkRunningColumn(null);
    }
  };

  const handleCopyToClipboard = async (value: string) => {
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

  const processorColumns = columns.filter((c) => c.mode === "processor");
  const copyableColumns = [
    { key: "title", label: "Title" },
    { key: "source", label: "Source" },
    { key: "uploader", label: "Uploader" },
    { key: "created", label: "Created" },
    ...columns.map((column) => ({
      key: `column:${column.key}`,
      label: column.name,
    })),
  ];

  useEffect(() => {
    if (!processorColumns.length) {
      if (selectedBulkColumn) {
        setSelectedBulkColumn("");
      }
      return;
    }

    const stillValid = processorColumns.some(
      (column) => column.id === selectedBulkColumn,
    );
    if (!stillValid && selectedBulkColumn) {
      setSelectedBulkColumn("");
    }
  }, [processorColumns, selectedBulkColumn]);

  useEffect(() => {
    if (!copyableColumns.length) {
      if (selectedCopyColumn) {
        setSelectedCopyColumn("");
      }
      return;
    }

    const stillValid = copyableColumns.some(
      (column) => column.key === selectedCopyColumn,
    );
    if (!stillValid && selectedCopyColumn) {
      setSelectedCopyColumn("");
    }
  }, [copyableColumns, selectedCopyColumn]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/projects/${project.id}/documents/search`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, includeRuns: true }),
            signal: controller.signal,
          },
        );

        if (!response.ok) return;
        const data = (await response.json()) as {
          documents: DocumentWithRuns[];
        };
        if (!isActive) return;
        setDocuments(data.documents);
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
  }, [filters, project.id]);

  const getColumnValue = (doc: DocumentWithRuns, columnKey: string) => {
    const values = (doc.values as Record<string, unknown>) || {};

    if (columnKey.startsWith("column:")) {
      const key = columnKey.replace("column:", "");
      const value = values[key];
      if (value === undefined || value === null) return "";
      if (typeof value === "string") return value;
      return JSON.stringify(value);
    }

    switch (columnKey) {
      case "title":
        return doc.title;
      case "source":
        if (doc.sourceType === "url") return doc.sourceUrl || "URL";
        return "Upload";
      case "uploader":
        return doc.uploadedBy?.name || doc.uploadedBy?.email || "Unknown";
      case "created":
        return formatDateTime(doc.createdAt);
      default:
        return "";
    }
  };

  const handleCopyColumn = () => {
    if (!selectedCopyColumn) return;
    const values = filteredDocuments.map((doc) =>
      getColumnValue(doc, selectedCopyColumn),
    );
    handleCopyToClipboard(values.join("\n\n"));
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
            onClick={() => router.push(`/projects/${project.id}`)}
          >
            Back to Project
          </Button>
          <Button variant="secondary" onClick={() => setShowAddColumn(true)}>
            Add Column
          </Button>
          <Button onClick={() => setShowAddDocument(true)}>Add Document</Button>
        </div>
      </div>

      {/* Bulk actions */}
      {processorColumns.length > 0 && documents.length > 0 && (
        <div className="section">
          <div className="section__header">
            <h3 className="section__title">Bulk Actions</h3>
          </div>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ minWidth: "220px" }}>
                <Select
                  value={selectedBulkColumn}
                  onValueChange={setSelectedBulkColumn}
                  placeholder="Select processor column"
                >
                  {processorColumns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!selectedBulkColumn}
                isLoading={bulkRunningColumn === selectedBulkColumn}
                onClick={() => handleBulkRun(selectedBulkColumn)}
              >
                Run processor on all docs
              </Button>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ minWidth: "220px" }}>
                <Select
                  value={selectedCopyColumn}
                  onValueChange={setSelectedCopyColumn}
                  placeholder="Select column to copy"
                >
                  {copyableColumns.map((column) => (
                    <SelectItem key={column.key} value={column.key}>
                      {column.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!selectedCopyColumn}
                onClick={handleCopyColumn}
              >
                Copy column values
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge Table */}
      <div className="section">
        <div className="section__header">
          <div>
            <h3 className="section__title">Documents</h3>
            <span style={{ fontSize: "14px", color: "var(--color-gray-500)" }}>
              {filteredDocuments.length} document
              {filteredDocuments.length !== 1 ? "s" : ""}, {columns.length}{" "}
              column{columns.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <DocumentSelection
          documents={documents}
          columns={columns}
          onFiltersChange={setFilters}
          serverFiltering
        />

        <KnowledgeTable
          projectId={project.id}
          documents={filteredDocuments as any}
          columns={columns}
          onRefresh={handleRefresh}
          onEditColumn={setColumnToEdit}
          onDeleteColumn={setColumnToDelete}
          onDeleteDocument={setDocumentToDelete}
        />
      </div>

      {/* Modals */}
      <AddDocumentModal
        projectId={project.id}
        open={showAddDocument}
        onOpenChange={setShowAddDocument}
        onSuccess={handleRefresh}
      />

      {/* Add Column Modal */}
      <ColumnModal
        projectId={project.id}
        open={showAddColumn}
        onOpenChange={setShowAddColumn}
        onSuccess={handleRefresh}
      />

      {/* Edit Column Modal */}
      <ColumnModal
        projectId={project.id}
        column={columnToEdit}
        open={Boolean(columnToEdit)}
        onOpenChange={(open) => {
          if (!open) setColumnToEdit(null);
        }}
        onSuccess={handleRefresh}
      />

      <DeleteColumnModal
        projectId={project.id}
        column={columnToDelete}
        open={Boolean(columnToDelete)}
        onOpenChange={(open) => {
          if (!open) setColumnToDelete(null);
        }}
        onSuccess={handleRefresh}
      />

      <DeleteDocumentModal
        projectId={project.id}
        document={documentToDelete}
        open={Boolean(documentToDelete)}
        onOpenChange={(open) => {
          if (!open) setDocumentToDelete(null);
        }}
        onSuccess={handleRefresh}
      />
    </div>
  );
}

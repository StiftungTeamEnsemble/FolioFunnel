"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Project, Document, Column } from "@prisma/client";
import { Button, Input, Select, SelectItem } from "@/components/ui";
import { KnowledgeTable } from "@/components/documents/KnowledgeTable";
import { AddDocumentModal } from "@/components/documents/AddDocumentModal";
import { ColumnModal } from "@/components/documents/ColumnModal";
import { DeleteColumnModal } from "@/components/documents/DeleteColumnModal";
import { DeleteDocumentModal } from "@/components/documents/DeleteDocumentModal";
import { triggerBulkProcessorRun } from "@/app/actions/runs";
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
  const [columnToEdit, setColumnToEdit] = useState<Column | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<Column | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("all");

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredDocuments = useMemo(() => {
    if (!normalizedSearchTerm) return documents;

    const matchesValue = (value: unknown) => {
      if (value === undefined || value === null) return false;
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return text.toLowerCase().includes(normalizedSearchTerm);
    };

    return documents.filter((doc) => {
      const values = (doc.values as Record<string, unknown>) || {};
      const createdDate = formatDateTime(doc.createdAt);
      const sourceText = `${doc.sourceType}${doc.sourceUrl ? " " + doc.sourceUrl : ""}`;

      if (searchField === "title") {
        return matchesValue(doc.title);
      }

      if (searchField === "source") {
        return matchesValue(sourceText);
      }

      if (searchField === "created") {
        return matchesValue(createdDate);
      }

      if (searchField.startsWith("column:")) {
        const key = searchField.replace("column:", "");
        return matchesValue(values[key]);
      }

      return (
        matchesValue(doc.title) ||
        matchesValue(sourceText) ||
        matchesValue(createdDate) ||
        Object.values(values).some(matchesValue)
      );
    });
  }, [documents, normalizedSearchTerm, searchField]);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!searchField.startsWith("column:")) return;
    const key = searchField.replace("column:", "");
    const columnExists = columns.some((column) => column.key === key);
    if (!columnExists) {
      setSearchField("all");
    }
  }, [columns, searchField]);

  const handleBulkRun = async (columnId: string) => {
    setBulkRunningColumn(columnId);
    try {
      await triggerBulkProcessorRun(project.id, columnId);
      setTimeout(handleRefresh, 2000);
    } finally {
      setBulkRunningColumn(null);
    }
  };

  const processorColumns = columns.filter((c) => c.mode === "processor");

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
            Prompt Processor
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/projects/${project.id}/edit`)}
          >
            Project Settings
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
        </div>
      )}

      {/* Knowledge Table */}
      <div className="section">
        <div className="section__header">
          <div>
            <h3 className="section__title">Documents</h3>
            <span style={{ fontSize: "14px", color: "var(--color-gray-500)" }}>
              {filteredDocuments.length} document
              {filteredDocuments.length !== 1 ? "s" : ""}
              {filteredDocuments.length !== documents.length && (
                <> of {documents.length}</>
              )}
              , {columns.length} column{columns.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="table__filters">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search documents"
              aria-label="Search documents"
            />
            <div className="table__filters__field">
              <Select
                value={searchField}
                onValueChange={setSearchField}
                placeholder="All fields"
              >
                <SelectItem value="all">All fields</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="source">Source</SelectItem>
                <SelectItem value="created">Created date</SelectItem>
                {columns.map((column) => (
                  <SelectItem key={column.id} value={`column:${column.key}`}>
                    {column.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
        </div>

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

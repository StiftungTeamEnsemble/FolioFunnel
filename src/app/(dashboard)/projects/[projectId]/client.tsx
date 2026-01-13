'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Project, Document, Column } from '@prisma/client';
import { Button, Select, SelectItem } from '@/components/ui';
import { KnowledgeTable } from '@/components/documents/KnowledgeTable';
import { AddDocumentModal } from '@/components/documents/AddDocumentModal';
import { AddColumnModal } from '@/components/documents/AddColumnModal';
import { EditColumnModal } from '@/components/documents/EditColumnModal';
import { DeleteColumnModal } from '@/components/documents/DeleteColumnModal';
import { triggerBulkProcessorRun } from '@/app/actions/runs';

interface DocumentWithRuns extends Document {
  latestRuns?: Record<string, { status: string; error: string | null }>;
}

interface ProjectPageClientProps {
  project: Project;
  initialDocuments: DocumentWithRuns[];
  initialColumns: Column[];
}

export function ProjectPageClient({
  project,
  initialDocuments,
  initialColumns,
}: ProjectPageClientProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [columns, setColumns] = useState(initialColumns);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [bulkRunningColumn, setBulkRunningColumn] = useState<string | null>(null);
  const [selectedBulkColumn, setSelectedBulkColumn] = useState<string>('');
  const [columnToEdit, setColumnToEdit] = useState<Column | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<Column | null>(null);

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
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const handleBulkRun = async (columnId: string) => {
    setBulkRunningColumn(columnId);
    try {
      await triggerBulkProcessorRun(project.id, columnId);
      setTimeout(handleRefresh, 2000);
    } finally {
      setBulkRunningColumn(null);
    }
  };

  const processorColumns = columns.filter((c) => c.mode === 'processor');

  useEffect(() => {
    if (!processorColumns.length) {
      setSelectedBulkColumn('');
      return;
    }

    const stillValid = processorColumns.some(
      (column) => column.id === selectedBulkColumn
    );
    if (!stillValid) {
      setSelectedBulkColumn(processorColumns[0]?.id ?? '');
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
            onClick={() => router.push(`/projects/${project.id}/edit`)}
          >
            Project Settings
          </Button>
          <Button variant="secondary" onClick={() => setShowAddColumn(true)}>
            Add Column
          </Button>
          <Button onClick={() => setShowAddDocument(true)}>
            Add Document
          </Button>
        </div>
      </div>

      {/* Bulk actions */}
      {processorColumns.length > 0 && documents.length > 0 && (
        <div className="section">
          <div className="section__header">
            <h3 className="section__title">Bulk Actions</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '220px' }}>
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
          <h3 className="section__title">Documents</h3>
          <span style={{ fontSize: '14px', color: 'var(--color-gray-500)' }}>
            {documents.length} document{documents.length !== 1 ? 's' : ''},{' '}
            {columns.length} column{columns.length !== 1 ? 's' : ''}
          </span>
        </div>

        <KnowledgeTable
          projectId={project.id}
          documents={documents as any}
          columns={columns}
          onRefresh={handleRefresh}
          onEditColumn={setColumnToEdit}
          onDeleteColumn={setColumnToDelete}
        />
      </div>

      {/* Modals */}
      <AddDocumentModal
        projectId={project.id}
        open={showAddDocument}
        onOpenChange={setShowAddDocument}
        onSuccess={handleRefresh}
      />

      <AddColumnModal
        projectId={project.id}
        open={showAddColumn}
        onOpenChange={setShowAddColumn}
        onSuccess={handleRefresh}
      />

      <EditColumnModal
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
    </div>
  );
}

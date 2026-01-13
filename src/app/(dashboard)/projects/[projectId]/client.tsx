'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Project, Document, Column } from '@prisma/client';
import { Button } from '@/components/ui';
import { KnowledgeTable } from '@/components/documents/KnowledgeTable';
import { AddDocumentModal } from '@/components/documents/AddDocumentModal';
import { AddColumnModal } from '@/components/documents/AddColumnModal';
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

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

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
            {processorColumns.map((column) => (
              <Button
                key={column.id}
                variant="secondary"
                size="sm"
                isLoading={bulkRunningColumn === column.id}
                onClick={() => handleBulkRun(column.id)}
              >
                Run &quot;{column.name}&quot; on all docs
              </Button>
            ))}
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
    </div>
  );
}

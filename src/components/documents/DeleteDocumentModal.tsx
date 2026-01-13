'use client';

import { useState } from 'react';
import { Button, Modal, ModalContent, ModalFooter } from '@/components/ui';
import { deleteDocument } from '@/app/actions/documents';
import { Document } from '@prisma/client';

interface DeleteDocumentModalProps {
  projectId: string;
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteDocumentModal({
  projectId,
  document,
  open,
  onOpenChange,
  onSuccess,
}: DeleteDocumentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!document) return;
    setLoading(true);
    setError(null);

    const result = await deleteDocument(projectId, document.id);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Delete Document" size="sm">
        <div className="form">
          {error && (
            <div style={{ color: 'var(--color-error)', marginBottom: '16px' }}>
              {error}
            </div>
          )}
          <p style={{ marginBottom: '16px' }}>
            Are you sure you want to delete{' '}
            <strong>{document?.title ?? 'this document'}</strong>? This will
            permanently remove the document and its stored file.
          </p>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" isLoading={loading} onClick={handleDelete}>
              Delete Document
            </Button>
          </ModalFooter>
        </div>
      </ModalContent>
    </Modal>
  );
}

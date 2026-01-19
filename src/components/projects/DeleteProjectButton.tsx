'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProject } from '@/app/actions/projects';
import { Button, Modal, ModalContent, ModalFooter } from '@/components/ui';

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  isOwner: boolean;
}

export function DeleteProjectButton({ projectId, projectName, isOwner }: DeleteProjectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!isOwner) {
    return null;
  }

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    const result = await deleteProject(projectId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    router.refresh();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        style={{
          padding: '4px 8px',
          fontSize: '13px',
          color: 'var(--color-red-600)',
          backgroundColor: 'transparent',
          border: '1px solid var(--color-red-200)',
          borderRadius: '4px',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-red-50)';
          e.currentTarget.style.borderColor = 'var(--color-red-300)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.borderColor = 'var(--color-red-200)';
        }}
      >
        Delete
      </button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent title="Delete Project" size="sm">
          <div className="form">
            {error && (
              <div style={{ color: 'var(--color-error)', marginBottom: '16px' }}>
                {error}
              </div>
            )}
            <p style={{ marginBottom: '16px' }}>
              Are you sure you want to delete{' '}
              <strong>{projectName}</strong>? This action cannot be undone and will delete all documents, knowledge tables, and data associated with this project.
            </p>
            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" isLoading={loading} onClick={handleDelete}>
                Delete Project
              </Button>
            </ModalFooter>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}

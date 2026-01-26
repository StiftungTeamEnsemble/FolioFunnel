"use client";

import { useState } from "react";
import { Button, Modal, ModalContent, ModalFooter } from "@/components/ui";
import { deleteColumn } from "@/app/actions/columns";
import { Column } from "@prisma/client";

interface DeleteColumnModalProps {
  projectId: string;
  column: Column | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteColumnModal({
  projectId,
  column,
  open,
  onOpenChange,
  onSuccess,
}: DeleteColumnModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!column) return;
    setLoading(true);
    setError(null);

    const result = await deleteColumn(projectId, column.id);
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
      <ModalContent title="Delete Column" size="sm">
        <div className="form">
          {error && (
            <div style={{ color: "var(--color-error)", marginBottom: "16px" }}>
              {error}
            </div>
          )}
          <p style={{ marginBottom: "16px" }}>
            Are you sure you want to delete{" "}
            <strong>{column?.name ?? "this column"}</strong>? This will remove
            the column from the table and any existing values for it.
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
              Delete Column
            </Button>
          </ModalFooter>
        </div>
      </ModalContent>
    </Modal>
  );
}

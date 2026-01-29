"use client";

import { useState } from "react";
import { Button, Modal, ModalContent, ModalFooter } from "@/components/ui";
import { softDeletePromptRunAction } from "@/app/actions/prompt-runs";
import { Run } from "@prisma/client";

interface DeletePromptRunModalProps {
  projectId: string;
  run: Run | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeletePromptRunModal({
  projectId,
  run,
  open,
  onOpenChange,
  onSuccess,
}: DeletePromptRunModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!run) return;
    setLoading(true);
    setError(null);

    const result = await softDeletePromptRunAction({
      projectId,
      promptRunId: run.id,
    });
    if (result?.error) {
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
      <ModalContent title="Delete Prompt Run" size="sm">
        <div className="form">
          {error && (
            <div style={{ color: "var(--color-error)", marginBottom: "16px" }}>
              {error}
            </div>
          )}
          <p style={{ marginBottom: "16px" }}>
            Are you sure you want to delete{" "}
            <strong>{run?.model ?? "this prompt run"}</strong>? This action
            cannot be undone, and the run will be permanently removed from the
            history.
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
              Delete Run
            </Button>
          </ModalFooter>
        </div>
      </ModalContent>
    </Modal>
  );
}

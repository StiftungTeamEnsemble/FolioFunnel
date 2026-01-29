"use client";

import { useState } from "react";
import { Button, Modal, ModalContent, ModalFooter } from "@/components/ui";
import { deletePromptTemplateAction } from "@/app/actions/prompt-templates";
import { PromptTemplate } from "@prisma/client";

interface DeletePromptTemplateModalProps {
  projectId: string;
  promptTemplate: PromptTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeletePromptTemplateModal({
  projectId,
  promptTemplate,
  open,
  onOpenChange,
  onSuccess,
}: DeletePromptTemplateModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!promptTemplate) return;
    setLoading(true);
    setError(null);

    const result = await deletePromptTemplateAction({
      projectId,
      promptTemplateId: promptTemplate.id,
    });
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
      <ModalContent title="Delete Prompt Template" size="sm">
        <div className="form">
          {error && (
            <div style={{ color: "var(--color-error)", marginBottom: "16px" }}>
              {error}
            </div>
          )}
          <p style={{ marginBottom: "16px" }}>
            Are you sure you want to delete{" "}
            <strong>{promptTemplate?.title ?? "this prompt template"}</strong>?
            This action is permanent and cannot be undone.
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
              Delete Template
            </Button>
          </ModalFooter>
        </div>
      </ModalContent>
    </Modal>
  );
}

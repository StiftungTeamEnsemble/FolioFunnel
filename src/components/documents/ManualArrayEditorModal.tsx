"use client";

import { Column } from "@prisma/client";
import { Button, Modal, ModalContent, ModalFooter } from "@/components/ui";
import { ArrayValueEditor } from "@/components/documents/ArrayValueEditor";

interface ManualArrayEditorState {
  docId: string;
  column: Column;
  values: string[];
}

interface ManualArrayEditorModalProps {
  state: ManualArrayEditorState | null;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onChangeValue: (index: number, value: string) => void;
  onAddValue: (defaultValue: string) => void;
  onRemoveValue: (index: number) => void;
  onSave: () => void;
}

const getManualTextArrayConfig = (column: Column) => {
  const config = (column.processorConfig as Record<string, unknown>) || {};
  const allowedValues = Array.isArray(config.manualTextArrayAllowedValues)
    ? config.manualTextArrayAllowedValues.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return {
    restrictToAllowed: config.manualTextArrayRestrict === true,
    allowedValues,
  };
};

export function ManualArrayEditorModal({
  state,
  error,
  isSaving,
  onClose,
  onChangeValue,
  onAddValue,
  onRemoveValue,
  onSave,
}: ManualArrayEditorModalProps) {
  const isOpen = Boolean(state);
  const duplicateValues = (() => {
    if (!state) return [];
    const seen = new Map<string, number>();
    const duplicates = new Set<string>();
    state.values.forEach((value) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const count = seen.get(trimmed) ?? 0;
      if (count >= 1) {
        duplicates.add(trimmed);
      }
      seen.set(trimmed, count + 1);
    });
    return Array.from(duplicates);
  })();
  const hasDuplicateValues = duplicateValues.length > 0;

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {state && (
        <ModalContent title={`Edit ${state.column.name}`} size="md">
          {(() => {
            const isTextArray = state.column.type === "text_array";
            const manualConfig = isTextArray
              ? getManualTextArrayConfig(state.column)
              : null;
            const isRestricted =
              isTextArray && manualConfig?.restrictToAllowed;
            const allowedValues = manualConfig?.allowedValues ?? [];
            const disableAdd = isRestricted && allowedValues.length === 0;

            return (
              <div className="form">
                {error && (
                  <div style={{ color: "var(--color-error)" }}>{error}</div>
                )}
                {hasDuplicateValues && (
                  <div style={{ color: "var(--color-warning)" }}>
                    Duplicate values found: {duplicateValues.join(", ")}. Remove
                    duplicates before saving.
                  </div>
                )}
                {isTextArray && isRestricted && allowedValues.length === 0 && (
                  <p className="input-group__hint">
                    Add allowed tag values in the column settings to enable
                    selection.
                  </p>
                )}
                <ArrayValueEditor
                  values={state.values}
                  onChangeValue={onChangeValue}
                  onAddValue={onAddValue}
                  onRemoveValue={onRemoveValue}
                  inputType={
                    state.column.type === "number_array" ? "number" : "text"
                  }
                  selectOptions={isRestricted ? allowedValues : undefined}
                  disableAdd={disableAdd}
                />
              </div>
            );
          })()}
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSave}
              isLoading={isSaving}
              disabled={hasDuplicateValues}
            >
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      )}
    </Modal>
  );
}

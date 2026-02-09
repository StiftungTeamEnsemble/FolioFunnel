"use client";

import { Column } from "@prisma/client";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  Select,
  SelectItem,
} from "@/components/ui";

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
                {state.values.length === 0 && (
                  <p className="input-group__hint">No values yet.</p>
                )}
                {state.values.map((value, index) => (
                  <div key={index} className="form__row">
                    {isRestricted ? (
                      <Select
                        value={value}
                        onValueChange={(nextValue) =>
                          onChangeValue(index, nextValue)
                        }
                      >
                        {allowedValues.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        type={
                          state.column.type === "number_array"
                            ? "number"
                            : "text"
                        }
                        value={value}
                        onChange={(event) =>
                          onChangeValue(index, event.target.value)
                        }
                      />
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onRemoveValue(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {isTextArray && isRestricted && allowedValues.length === 0 && (
                  <p className="input-group__hint">
                    Add allowed tag values in the column settings to enable
                    selection.
                  </p>
                )}
                <div className="form__row">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const defaultValue =
                        isRestricted && allowedValues.length
                          ? allowedValues[0]
                          : "";
                      onAddValue(defaultValue);
                    }}
                    disabled={disableAdd}
                  >
                    Add value
                  </Button>
                </div>
              </div>
            );
          })()}
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} isLoading={isSaving}>
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      )}
    </Modal>
  );
}

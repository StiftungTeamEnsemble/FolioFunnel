"use client";

import { Button, Input, Select, SelectItem } from "@/components/ui";

interface ArrayValueEditorProps {
  values: string[];
  onChangeValue: (index: number, value: string) => void;
  onAddValue: (defaultValue: string) => void;
  onRemoveValue: (index: number) => void;
  addLabel?: string;
  emptyMessage?: string;
  inputType?: "text" | "number";
  selectOptions?: string[];
  disableAdd?: boolean;
}

export function ArrayValueEditor({
  values,
  onChangeValue,
  onAddValue,
  onRemoveValue,
  addLabel = "Add value",
  emptyMessage = "No values yet.",
  inputType = "text",
  selectOptions,
  disableAdd,
}: ArrayValueEditorProps) {
  return (
    <div className="form">
      {values.length === 0 && (
        <p className="input-group__hint">{emptyMessage}</p>
      )}
      {values.map((value, index) => (
        <div key={index} className="form__row">
          {selectOptions ? (
            <Select
              value={value}
              onValueChange={(nextValue) => onChangeValue(index, nextValue)}
            >
              {selectOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </Select>
          ) : (
            <Input
              type={inputType}
              value={value}
              onChange={(event) => onChangeValue(index, event.target.value)}
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
      <div className="form__row">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onAddValue(selectOptions?.[0] ?? "")}
          disabled={disableAdd}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

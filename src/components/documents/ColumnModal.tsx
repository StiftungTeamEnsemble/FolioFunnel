"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Input,
  InputGroup,
  Modal,
  ModalContent,
  ModalFooter,
  Select,
  SelectItem,
  Textarea,
} from "@/components/ui";
import { createColumn, updateColumn } from "@/app/actions/columns";
import { Column, ColumnMode, ProcessorType } from "@prisma/client";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/models";

// Available metadata fields
const METADATA_FIELDS = [
  { key: "title", label: "Title (PDF/URL)" },
  { key: "author", label: "Author (PDF/URL meta tag)" },
  { key: "subject", label: "Subject (PDF) / Description meta (URL)" },
  { key: "keywords", label: "Keywords (PDF/URL meta tags)" },
  { key: "creator", label: "Creator (PDF/URL meta tag)" },
  { key: "producer", label: "Producer (PDF/URL meta tag)" },
  { key: "creationDate", label: "Creation Date (PDF/URL meta tag)" },
  { key: "modDate", label: "Modification Date (PDF/URL meta tag)" },
  { key: "pageCount", label: "Page Count (PDF only)" },
  { key: "format", label: "Format (PDF/URL meta tag)" },
];

interface ColumnModalProps {
  projectId: string;
  /** If provided, the modal is in edit mode. Otherwise, it's in add mode. */
  column?: Column | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface TextArrayReplacement {
  pattern: string;
  replacement: string;
  flags: string;
}

export function ColumnModal({
  projectId,
  column,
  open,
  onOpenChange,
  onSuccess,
}: ColumnModalProps) {
  const isEditMode = !!column;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState<
    "text" | "number" | "text_array" | "number_array"
  >("text");
  const [mode, setMode] = useState<ColumnMode>("manual");
  const [processorType, setProcessorType] = useState<ProcessorType>(
    "document_to_markdown",
  );

  // Processor config state
  const [metadataField, setMetadataField] = useState("title");
  const [sourceColumnKey, setSourceColumnKey] = useState("");
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [useChunks, setUseChunks] = useState<"true" | "false">("true");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CHAT_MODEL);
  const [splitPattern, setSplitPattern] = useState(
    String.raw`(?:\r?\n)(?=[*-]\s+)`,
  );
  const [splitFlags, setSplitFlags] = useState("");
  const [splitReplacements, setSplitReplacements] = useState<
    TextArrayReplacement[]
  >([]);

  // Reset form when modal opens or column changes
  useEffect(() => {
    if (!open) return;

    if (column) {
      // Edit mode: populate from existing column
      setKey(column.key);
      setName(column.name);
      setDataType(column.type);
      setMode(column.mode);
      if (column.processorType) {
        setProcessorType(column.processorType);
      }

      const config = (column.processorConfig as Record<string, unknown>) || {};
      setMetadataField(
        typeof config.metadataField === "string"
          ? config.metadataField
          : "title",
      );
      setSourceColumnKey(
        typeof config.sourceColumnKey === "string"
          ? config.sourceColumnKey
          : "",
      );
      setChunkSize(
        typeof config.chunkSize === "number" ? config.chunkSize : 1000,
      );
      setChunkOverlap(
        typeof config.chunkOverlap === "number" ? config.chunkOverlap : 200,
      );
      setUseChunks(config.useChunks === false ? "false" : "true");
      setPromptTemplate(
        typeof config.promptTemplate === "string" ? config.promptTemplate : "",
      );
      setSelectedModel(
        typeof config.model === "string" ? config.model : DEFAULT_CHAT_MODEL,
      );
      setSplitPattern(
        typeof config.splitPattern === "string"
          ? config.splitPattern
          : String.raw`(?:\r?\n)(?=[*-]\s+)`,
      );
      setSplitFlags(
        typeof config.splitFlags === "string" ? config.splitFlags : "",
      );
      setSplitReplacements(
        Array.isArray(config.replacements)
          ? config.replacements
              .filter(
                (replacement) =>
                  replacement &&
                  typeof replacement.pattern === "string" &&
                  typeof replacement.replacement === "string",
              )
              .map((replacement) => ({
                pattern: replacement.pattern,
                replacement: replacement.replacement,
                flags:
                  typeof replacement.flags === "string"
                    ? replacement.flags
                    : "g",
              }))
          : [],
      );
    } else {
      // Add mode: reset to defaults
      setKey("");
      setName("");
      setDataType("text");
      setMode("manual");
      setProcessorType("document_to_markdown");
      setMetadataField("title");
      setSourceColumnKey("");
      setChunkSize(1000);
      setChunkOverlap(200);
      setUseChunks("true");
      setPromptTemplate("");
      setSelectedModel(DEFAULT_CHAT_MODEL);
      setSplitPattern(String.raw`(?:\r?\n)(?=[*-]\s+)`);
      setSplitFlags("");
      setSplitReplacements([]);
    }
    setError(null);
  }, [open, column]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);

    if (!isEditMode) {
      // Only set these for new columns
      formData.set("key", key);
      formData.set("type", dataType);
      formData.set("mode", mode);
    }

    if (mode === "processor") {
      formData.set("processorType", processorType);

      const config: Record<string, unknown> = {};

      // Source column for chunk_text, create_embeddings, count_tokens
      if (
        processorType === "chunk_text" ||
        processorType === "create_embeddings" ||
        processorType === "count_tokens" ||
        processorType === "text_array_split"
      ) {
        if (sourceColumnKey) {
          config.sourceColumnKey = sourceColumnKey;
        }
      }

      // Chunk text config
      if (processorType === "chunk_text") {
        config.chunkSize = chunkSize;
        config.chunkOverlap = chunkOverlap;
        config.storeInChunksTable = true;
      }

      // Embeddings config
      if (processorType === "create_embeddings") {
        config.useChunks = useChunks === "true";
        config.model = "text-embedding-3-small";
      }

      // OpenAI Transform config
      if (processorType === "ai_transform") {
        config.promptTemplate = promptTemplate;
        config.model = selectedModel;
        config.outputType = dataType === "number" ? "number" : "text";
        config.autoConvert = dataType === "number";
      }

      // Text array split config
      if (processorType === "text_array_split") {
        config.splitPattern = splitPattern;
        if (splitFlags) {
          config.splitFlags = splitFlags;
        }
        const replacements = splitReplacements
          .filter((replacement) => replacement.pattern.trim().length > 0)
          .map((replacement) => ({
            pattern: replacement.pattern,
            replacement: replacement.replacement,
            flags: replacement.flags,
          }));
        if (replacements.length > 0) {
          config.replacements = replacements;
        }
      }

      // Count tokens config
      if (processorType === "count_tokens") {
        config.model = selectedModel;
      }

      // PDF Metadata config
      if (
        processorType === "pdf_to_metadata" ||
        processorType === "document_to_metadata"
      ) {
        config.metadataField = metadataField;
      }

      // URL to Markdown config (no additional config needed)
      if (processorType === "url_to_markdown") {
        // URL to Markdown processor doesn't require additional configuration
      }

      formData.set("processorConfig", JSON.stringify(config));
    }

    let result;
    if (isEditMode) {
      result = await updateColumn(projectId, column.id, formData);
    } else {
      result = await createColumn(projectId, formData);
    }

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setLoading(false);
    onOpenChange(false);
    onSuccess();
  };

  const updateReplacement = (
    index: number,
    field: keyof TextArrayReplacement,
    value: string,
  ) => {
    setSplitReplacements((prev) =>
      prev.map((replacement, currentIndex) =>
        currentIndex === index
          ? { ...replacement, [field]: value }
          : replacement,
      ),
    );
  };

  const addReplacement = () => {
    setSplitReplacements((prev) => [
      ...prev,
      { pattern: "", replacement: "", flags: "g" },
    ]);
  };

  const removeReplacement = (index: number) => {
    setSplitReplacements((prev) =>
      prev.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  // Check if we need source column input
  const needsSourceColumn =
    processorType === "chunk_text" ||
    processorType === "create_embeddings" ||
    processorType === "count_tokens" ||
    processorType === "text_array_split";

  // Check if we need model selection
  const needsModelSelection =
    processorType === "ai_transform" || processorType === "count_tokens";

  // Get available processor types based on data type
  const getProcessorTypesForDataType = () => {
    switch (dataType) {
      case "text":
        return [
          { value: "document_to_markdown", label: "Document → Text" },
          { value: "document_to_metadata", label: "Document → Metadata" },
          { value: "ai_transform", label: "AI Transform" },
        ];
      case "number":
        return [
          { value: "ai_transform", label: "AI Transform" },
          { value: "count_tokens", label: "Count Tokens (OpenAI)" },
        ];
      case "text_array":
        return [
          { value: "text_array_split", label: "Split Text (Regex)" },
          { value: "chunk_text", label: "Chunk Text" },
        ];
      case "number_array":
        return [{ value: "create_embeddings", label: "Create Embeddings" }];
      default:
        return [];
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title={isEditMode ? "Edit Column" : "Add Column"} size="md">
        <form onSubmit={handleSubmit} className="form">
          {error && (
            <div style={{ color: "var(--color-error)", marginBottom: "16px" }}>
              {error}
            </div>
          )}

          <InputGroup label="Column Key" htmlFor="key" required={!isEditMode}>
            <Input
              id="key"
              name="key"
              placeholder="e.g., summary, tags, content"
              pattern="^[a-z][a-z0-9_]*$"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isEditMode}
              required={!isEditMode}
            />
          </InputGroup>

          <InputGroup label="Display Name" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              placeholder="e.g., Summary, Tags, Content"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </InputGroup>

          {!isEditMode && (
            <>
              <InputGroup label="Data Type" htmlFor="type" required>
                <Select
                  value={dataType}
                  onValueChange={(v) => {
                    setDataType(
                      v as "text" | "number" | "text_array" | "number_array",
                    );
                    // Reset processor type when data type changes
                    const availableProcessors = getProcessorTypesForDataType();
                    if (availableProcessors.length > 0) {
                      setProcessorType(
                        availableProcessors[0].value as ProcessorType,
                      );
                    }
                  }}
                >
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="text_array">Text Array</SelectItem>
                  <SelectItem value="number_array">Number Array</SelectItem>
                </Select>
              </InputGroup>

              <InputGroup label="Mode" htmlFor="mode" required>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as ColumnMode)}
                >
                  <SelectItem value="manual">Manual (editable)</SelectItem>
                  <SelectItem value="processor">
                    Processor (automated)
                  </SelectItem>
                </Select>
              </InputGroup>
            </>
          )}

          {mode === "processor" && (
            <>
              <InputGroup
                label="Processor Type"
                htmlFor="processorType"
                required
              >
                <Select
                  value={processorType}
                  onValueChange={(v) => setProcessorType(v as ProcessorType)}
                >
                  {getProcessorTypesForDataType().map((processor) => (
                    <SelectItem key={processor.value} value={processor.value}>
                      {processor.label}
                    </SelectItem>
                  ))}
                </Select>
              </InputGroup>

              {(processorType === "pdf_to_metadata" ||
                processorType === "document_to_metadata") && (
                <InputGroup
                  label="Metadata Field"
                  htmlFor="metadataField"
                  required
                >
                  <Select
                    value={metadataField}
                    onValueChange={setMetadataField}
                  >
                    {METADATA_FIELDS.map((field) => (
                      <SelectItem key={field.key} value={field.key}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </Select>
                </InputGroup>
              )}

              {needsSourceColumn && (
                <InputGroup
                  label="Source Column Key"
                  htmlFor="sourceColumnKey"
                  required
                >
                  <Input
                    id="sourceColumnKey"
                    name="sourceColumnKey"
                    placeholder="e.g., markdown, content"
                    value={sourceColumnKey}
                    onChange={(e) => setSourceColumnKey(e.target.value)}
                    required
                  />
                </InputGroup>
              )}

              {processorType === "chunk_text" && (
                <div className="form__row">
                  <InputGroup label="Chunk Size" htmlFor="chunkSize">
                    <Input
                      id="chunkSize"
                      name="chunkSize"
                      type="number"
                      value={chunkSize}
                      onChange={(e) =>
                        setChunkSize(parseInt(e.target.value || "0", 10))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Overlap" htmlFor="chunkOverlap">
                    <Input
                      id="chunkOverlap"
                      name="chunkOverlap"
                      type="number"
                      value={chunkOverlap}
                      onChange={(e) =>
                        setChunkOverlap(parseInt(e.target.value || "0", 10))
                      }
                    />
                  </InputGroup>
                </div>
              )}

              {processorType === "text_array_split" && (
                <>
                  <InputGroup
                    label="Split Regex Pattern"
                    htmlFor="splitPattern"
                    hint="Regex used to split the source text. Defaults to splitting on unordered list bullets."
                  >
                    <Input
                      id="splitPattern"
                      name="splitPattern"
                      value={splitPattern}
                      onChange={(e) => setSplitPattern(e.target.value)}
                    />
                  </InputGroup>
                  <InputGroup
                    label="Split Regex Flags"
                    htmlFor="splitFlags"
                    hint="Optional regex flags (e.g., i, m, s). Leave blank for none."
                  >
                    <Input
                      id="splitFlags"
                      name="splitFlags"
                      value={splitFlags}
                      onChange={(e) => setSplitFlags(e.target.value)}
                    />
                  </InputGroup>
                  <div className="form__group">
                    <div className="form__row form__row--between">
                      <span className="input-group__label">
                        Per-item search &amp; replace
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={addReplacement}
                      >
                        Add replacement
                      </Button>
                    </div>
                    {splitReplacements.length === 0 && (
                      <p className="input-group__hint">
                        Add replacement rules to clean each split item (e.g.,
                        remove leading bullets).
                      </p>
                    )}
                    {splitReplacements.map((replacement, index) => (
                      <div key={index} className="form__row">
                        <InputGroup label="Search" htmlFor={`search-${index}`}>
                          <Input
                            id={`search-${index}`}
                            name={`search-${index}`}
                            placeholder="^[-*]\\s+"
                            value={replacement.pattern}
                            onChange={(e) =>
                              updateReplacement(
                                index,
                                "pattern",
                                e.target.value,
                              )
                            }
                          />
                        </InputGroup>
                        <InputGroup
                          label="Replace"
                          htmlFor={`replace-${index}`}
                        >
                          <Input
                            id={`replace-${index}`}
                            name={`replace-${index}`}
                            placeholder=""
                            value={replacement.replacement}
                            onChange={(e) =>
                              updateReplacement(
                                index,
                                "replacement",
                                e.target.value,
                              )
                            }
                          />
                        </InputGroup>
                        <InputGroup label="Flags" htmlFor={`flags-${index}`}>
                          <Input
                            id={`flags-${index}`}
                            name={`flags-${index}`}
                            placeholder="g"
                            value={replacement.flags}
                            onChange={(e) =>
                              updateReplacement(index, "flags", e.target.value)
                            }
                          />
                        </InputGroup>
                        <div className="form__button">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => removeReplacement(index)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {processorType === "create_embeddings" && (
                <InputGroup label="Embed Chunks" htmlFor="useChunks">
                  <Select
                    value={useChunks}
                    onValueChange={(v) => setUseChunks(v as "true" | "false")}
                  >
                    <SelectItem value="true">Yes - embed chunks</SelectItem>
                    <SelectItem value="false">
                      No - embed column directly
                    </SelectItem>
                  </Select>
                </InputGroup>
              )}

              {processorType === "ai_transform" && (
                <InputGroup
                  label="Prompt Template"
                  htmlFor="promptTemplate"
                  required
                  hint="Use {{document.columnKey}} to reference other columns. Use {{truncate document.columnKey 200}} to truncate."
                >
                  <Textarea
                    id="promptTemplate"
                    name="promptTemplate"
                    placeholder="Summarize the following document:\n\n{{document.columnKey}}"
                    value={promptTemplate}
                    onChange={(e) => setPromptTemplate(e.target.value)}
                    rows={4}
                    required
                  />
                </InputGroup>
              )}

              {needsModelSelection && (
                <div className="form__row">
                  <InputGroup
                    label={
                      processorType === "count_tokens"
                        ? "Model (for tokenization)"
                        : "Model"
                    }
                    htmlFor="model"
                  >
                    <Select
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                    >
                      {CHAT_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </InputGroup>
                </div>
              )}
            </>
          )}

          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={loading}>
              {isEditMode ? "Save Changes" : "Add Column"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

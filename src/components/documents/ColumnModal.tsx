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
  const [processorType, setProcessorType] =
    useState<ProcessorType>("document_to_markdown");

  // Processor config state
  const [metadataField, setMetadataField] = useState("title");
  const [sourceColumnKey, setSourceColumnKey] = useState("");
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [useChunks, setUseChunks] = useState<"true" | "false">("true");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CHAT_MODEL);
  const [temperature, setTemperature] = useState(0.7);

  // Reset form when modal opens or column changes
  useEffect(() => {
    if (!open) return;

    if (column) {
      // Edit mode: populate from existing column
      setKey(column.key);
      setName(column.name);
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
      setTemperature(
        typeof config.temperature === "number" ? config.temperature : 0.7,
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
      setTemperature(0.7);
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
        processorType === "count_tokens"
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
        config.temperature = temperature;
        config.outputType = dataType === "number" ? "number" : "text";
        config.autoConvert = dataType === "number";
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

  // Check if we need source column input
  const needsSourceColumn =
    processorType === "chunk_text" ||
    processorType === "create_embeddings" ||
    processorType === "count_tokens";

  // Check if we need model selection
  const needsModelSelection =
    processorType === "ai_transform" || processorType === "count_tokens";

  // Get available processor types based on data type
  const getProcessorTypesForDataType = () => {
    switch (dataType) {
      case "text":
        return [
          { value: "document_to_markdown", label: "Document → Markdown" },
          { value: "document_to_metadata", label: "Document → Metadata" },
          { value: "pdf_to_markdown_mupdf", label: "PDF → Markdown (MuPDF)" },
          { value: "pdf_to_metadata", label: "PDF → Metadata" },
          { value: "url_to_markdown", label: "URL → Markdown" },
          { value: "ai_transform", label: "AI Transform" },
        ];
      case "number":
        return [
          { value: "ai_transform", label: "AI Transform" },
          { value: "count_tokens", label: "Count Tokens (OpenAI)" },
        ];
      case "text_array":
        return [{ value: "chunk_text", label: "Chunk Text" }];
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
                  hint="Use {{columnKey}} to reference other columns"
                >
                  <Textarea
                    id="promptTemplate"
                    name="promptTemplate"
                    placeholder="Summarize the following document:\n\n{{markdown}}"
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
                  {processorType === "ai_transform" && (
                    <InputGroup label="Temperature" htmlFor="temperature">
                      <Input
                        id="temperature"
                        name="temperature"
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={temperature}
                        onChange={(e) =>
                          setTemperature(parseFloat(e.target.value || "0"))
                        }
                      />
                    </InputGroup>
                  )}
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

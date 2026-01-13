'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from '@/components/ui';
import { updateColumn } from '@/app/actions/columns';
import { Column, ProcessorType } from '@prisma/client';

interface EditColumnModalProps {
  projectId: string;
  column: Column | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditColumnModal({
  projectId,
  column,
  open,
  onOpenChange,
  onSuccess,
}: EditColumnModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [processorType, setProcessorType] = useState<ProcessorType>('pdf_to_markdown');
  const [sourceColumnKey, setSourceColumnKey] = useState('');
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [useChunks, setUseChunks] = useState<'true' | 'false'>('true');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.7);

  const processorConfig = useMemo(() => {
    if (!column?.processorConfig || typeof column.processorConfig !== 'object') {
      return {};
    }
    return column.processorConfig as Record<string, unknown>;
  }, [column]);

  useEffect(() => {
    if (!column) return;
    setName(column.name);
    if (column.processorType) {
      setProcessorType(column.processorType);
    }
    const sourceColumnValue = processorConfig.sourceColumnKey;
    if (typeof sourceColumnValue === 'string') {
      setSourceColumnKey(sourceColumnValue);
    } else {
      setSourceColumnKey('');
    }
    const chunkSizeValue = processorConfig.chunkSize;
    setChunkSize(typeof chunkSizeValue === 'number' ? chunkSizeValue : 1000);
    const chunkOverlapValue = processorConfig.chunkOverlap;
    setChunkOverlap(typeof chunkOverlapValue === 'number' ? chunkOverlapValue : 200);
    const useChunksValue = processorConfig.useChunks;
    setUseChunks(useChunksValue === false ? 'false' : 'true');
    const promptValue = processorConfig.promptTemplate;
    setPromptTemplate(typeof promptValue === 'string' ? promptValue : '');
    const modelValue = processorConfig.model;
    setModel(typeof modelValue === 'string' ? modelValue : 'gpt-4o-mini');
    const temperatureValue = processorConfig.temperature;
    setTemperature(typeof temperatureValue === 'number' ? temperatureValue : 0.7);
  }, [column, processorConfig]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!column) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set('name', name);

    if (column.mode === 'processor') {
      formData.set('processorType', processorType);
      const config: Record<string, unknown> = {};

      if (processorType === 'chunk_text' || processorType === 'create_embeddings') {
        if (sourceColumnKey) {
          config.sourceColumnKey = sourceColumnKey;
        }
      }

      if (processorType === 'chunk_text') {
        config.chunkSize = chunkSize;
        config.chunkOverlap = chunkOverlap;
        config.storeInChunksTable = true;
      }

      if (processorType === 'create_embeddings') {
        config.useChunks = useChunks === 'true';
        config.model = 'text-embedding-3-small';
      }

      if (processorType === 'openai_transform') {
        config.promptTemplate = promptTemplate;
        config.model = model;
        config.temperature = temperature;
      }

      formData.set('processorConfig', JSON.stringify(config));
    }

    const result = await updateColumn(projectId, column.id, formData);
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
      <ModalContent title="Edit Column" size="md">
        <form onSubmit={handleSubmit} className="form">
          {error && (
            <div style={{ color: 'var(--color-error)', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <InputGroup label="Column Key" htmlFor="columnKey">
            <Input id="columnKey" value={column?.key ?? ''} disabled />
          </InputGroup>

          <InputGroup label="Display Name" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </InputGroup>

          {column?.mode === 'processor' && (
            <>
              <InputGroup label="Processor Type" htmlFor="processorType" required>
                <Select
                  value={processorType}
                  onValueChange={(value) =>
                    setProcessorType(value as ProcessorType)
                  }
                >
                  <SelectItem value="pdf_to_markdown">PDF → Markdown</SelectItem>
                  <SelectItem value="url_to_text">URL → Text</SelectItem>
                  <SelectItem value="chunk_text">Chunk Text</SelectItem>
                  <SelectItem value="create_embeddings">Create Embeddings</SelectItem>
                  <SelectItem value="openai_transform">OpenAI Transform</SelectItem>
                </Select>
              </InputGroup>

              {(processorType === 'chunk_text' ||
                processorType === 'create_embeddings') && (
                <InputGroup
                  label="Source Column Key"
                  htmlFor="sourceColumnKey"
                  required
                >
                  <Input
                    id="sourceColumnKey"
                    name="sourceColumnKey"
                    value={sourceColumnKey}
                    onChange={(event) => setSourceColumnKey(event.target.value)}
                    required
                  />
                </InputGroup>
              )}

              {processorType === 'chunk_text' && (
                <div className="form__row">
                  <InputGroup label="Chunk Size" htmlFor="chunkSize">
                    <Input
                      id="chunkSize"
                      name="chunkSize"
                      type="number"
                      value={chunkSize}
                      onChange={(event) =>
                        setChunkSize(parseInt(event.target.value || '0', 10))
                      }
                    />
                  </InputGroup>
                  <InputGroup label="Overlap" htmlFor="chunkOverlap">
                    <Input
                      id="chunkOverlap"
                      name="chunkOverlap"
                      type="number"
                      value={chunkOverlap}
                      onChange={(event) =>
                        setChunkOverlap(parseInt(event.target.value || '0', 10))
                      }
                    />
                  </InputGroup>
                </div>
              )}

              {processorType === 'create_embeddings' && (
                <InputGroup label="Embed Chunks" htmlFor="useChunks">
                  <Select
                    value={useChunks}
                    onValueChange={(value) =>
                      setUseChunks(value as 'true' | 'false')
                    }
                  >
                    <SelectItem value="true">Yes - embed chunks</SelectItem>
                    <SelectItem value="false">No - embed column directly</SelectItem>
                  </Select>
                </InputGroup>
              )}

              {processorType === 'openai_transform' && (
                <>
                  <InputGroup
                    label="Prompt Template"
                    htmlFor="promptTemplate"
                    required
                    hint="Use {{columnKey}} to reference other columns"
                  >
                    <Textarea
                      id="promptTemplate"
                      name="promptTemplate"
                      value={promptTemplate}
                      onChange={(event) => setPromptTemplate(event.target.value)}
                      rows={4}
                      required
                    />
                  </InputGroup>
                  <div className="form__row">
                    <InputGroup label="Model" htmlFor="model">
                      <Select
                        value={model}
                        onValueChange={(value) => setModel(value)}
                      >
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      </Select>
                    </InputGroup>
                    <InputGroup label="Temperature" htmlFor="temperature">
                      <Input
                        id="temperature"
                        name="temperature"
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={temperature}
                        onChange={(event) =>
                          setTemperature(parseFloat(event.target.value || '0'))
                        }
                      />
                    </InputGroup>
                  </div>
                </>
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
              Save Changes
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

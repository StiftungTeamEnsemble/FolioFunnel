'use client';

import { useState } from 'react';
import { Button, Input, InputGroup, Modal, ModalContent, ModalFooter, Select, SelectItem, Textarea } from '@/components/ui';
import { createColumn } from '@/app/actions/columns';
import { ColumnType, ColumnMode, ProcessorType } from '@prisma/client';

interface AddColumnModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddColumnModal({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: AddColumnModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ColumnMode>('manual');
  const [processorType, setProcessorType] = useState<ProcessorType>('pdf_to_markdown');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set('mode', mode);
    
    if (mode === 'processor') {
      formData.set('processorType', processorType);
      
      // Build processor config based on type
      const config: Record<string, unknown> = {};
      
      if (processorType === 'chunk_text' || processorType === 'create_embeddings') {
        const sourceColumn = formData.get('sourceColumnKey');
        if (sourceColumn) config.sourceColumnKey = sourceColumn;
      }
      
      if (processorType === 'chunk_text') {
        config.chunkSize = parseInt(formData.get('chunkSize') as string) || 1000;
        config.chunkOverlap = parseInt(formData.get('chunkOverlap') as string) || 200;
        config.storeInChunksTable = true;
      }
      
      if (processorType === 'create_embeddings') {
        config.useChunks = formData.get('useChunks') === 'true';
        config.model = 'text-embedding-3-small';
      }
      
      if (processorType === 'openai_transform') {
        config.promptTemplate = formData.get('promptTemplate');
        config.model = formData.get('model') || 'gpt-4o-mini';
        config.temperature = parseFloat(formData.get('temperature') as string) || 0.7;
      }
      
      formData.set('processorConfig', JSON.stringify(config));
    }

    const result = await createColumn(projectId, formData);

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
      <ModalContent title="Add Column" size="md">
        <form onSubmit={handleSubmit} className="form">
          {error && (
            <div style={{ color: 'var(--color-error)', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <InputGroup label="Column Key" htmlFor="key" required>
            <Input
              id="key"
              name="key"
              placeholder="e.g., summary, tags, content"
              pattern="^[a-z][a-z0-9_]*$"
              required
            />
          </InputGroup>

          <InputGroup label="Display Name" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              placeholder="e.g., Summary, Tags, Content"
              required
            />
          </InputGroup>

          <InputGroup label="Data Type" htmlFor="type" required>
            <Select
              value="text"
              onValueChange={() => {}}
            >
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="text_array">Text Array</SelectItem>
              <SelectItem value="number_array">Number Array</SelectItem>
            </Select>
            <input type="hidden" name="type" value="text" />
          </InputGroup>

          <InputGroup label="Mode" htmlFor="mode" required>
            <Select value={mode} onValueChange={(v) => setMode(v as ColumnMode)}>
              <SelectItem value="manual">Manual (editable)</SelectItem>
              <SelectItem value="processor">Processor (automated)</SelectItem>
            </Select>
          </InputGroup>

          {mode === 'processor' && (
            <>
              <InputGroup label="Processor Type" htmlFor="processorType" required>
                <Select
                  value={processorType}
                  onValueChange={(v) => setProcessorType(v as ProcessorType)}
                >
                  <SelectItem value="pdf_to_markdown">PDF → Markdown</SelectItem>
                  <SelectItem value="url_to_text">URL → Text</SelectItem>
                  <SelectItem value="chunk_text">Chunk Text</SelectItem>
                  <SelectItem value="create_embeddings">Create Embeddings</SelectItem>
                  <SelectItem value="openai_transform">OpenAI Transform</SelectItem>
                </Select>
              </InputGroup>

              {(processorType === 'chunk_text' || processorType === 'create_embeddings') && (
                <InputGroup label="Source Column Key" htmlFor="sourceColumnKey" required>
                  <Input
                    id="sourceColumnKey"
                    name="sourceColumnKey"
                    placeholder="e.g., markdown, content"
                    required
                  />
                </InputGroup>
              )}

              {processorType === 'chunk_text' && (
                <>
                  <div className="form__row">
                    <InputGroup label="Chunk Size" htmlFor="chunkSize">
                      <Input
                        id="chunkSize"
                        name="chunkSize"
                        type="number"
                        defaultValue={1000}
                      />
                    </InputGroup>
                    <InputGroup label="Overlap" htmlFor="chunkOverlap">
                      <Input
                        id="chunkOverlap"
                        name="chunkOverlap"
                        type="number"
                        defaultValue={200}
                      />
                    </InputGroup>
                  </div>
                </>
              )}

              {processorType === 'create_embeddings' && (
                <InputGroup label="Embed Chunks" htmlFor="useChunks">
                  <Select
                    value="true"
                    onValueChange={() => {}}
                  >
                    <SelectItem value="true">Yes - embed chunks</SelectItem>
                    <SelectItem value="false">No - embed column directly</SelectItem>
                  </Select>
                  <input type="hidden" name="useChunks" value="true" />
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
                      placeholder="Summarize the following document:\n\n{{markdown}}"
                      rows={4}
                      required
                    />
                  </InputGroup>
                  <div className="form__row">
                    <InputGroup label="Model" htmlFor="model">
                      <Select value="gpt-4o-mini" onValueChange={() => {}}>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      </Select>
                      <input type="hidden" name="model" value="gpt-4o-mini" />
                    </InputGroup>
                    <InputGroup label="Temperature" htmlFor="temperature">
                      <Input
                        id="temperature"
                        name="temperature"
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        defaultValue={0.7}
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
              Add Column
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

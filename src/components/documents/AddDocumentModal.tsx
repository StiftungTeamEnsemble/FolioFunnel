'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  InputGroup,
  Modal,
  ModalContent,
  ModalFooter,
  Dropzone,
  FileItem,
} from '@/components/ui';
import { createDocumentFromUrl } from '@/app/actions/documents';
import * as Tabs from '@radix-ui/react-tabs';
import '@/styles/components/select.css';

interface AddDocumentModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddDocumentModal({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: AddDocumentModalProps) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Get comment from form
      const form = document.getElementById('upload-form') as HTMLFormElement;
      const comment = form ? (new FormData(form).get('comment') as string) : '';
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (comment) {
          formData.append('comment', comment);
        }

        const response = await fetch(`/api/projects/${projectId}/documents/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }

        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
      }

      setFiles([]);
      setUploadProgress({});
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createDocumentFromUrl(projectId, formData);

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
      <ModalContent title="Add Document" size="md">
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as 'upload' | 'url')}>
          <Tabs.List className="tabs__list">
            <Tabs.Trigger value="upload" className={`tabs__trigger ${tab === 'upload' ? 'tabs__trigger--active' : ''}`}>
              Upload File
            </Tabs.Trigger>
            <Tabs.Trigger value="url" className={`tabs__trigger ${tab === 'url' ? 'tabs__trigger--active' : ''}`}>
              From URL
            </Tabs.Trigger>
          </Tabs.List>

          {error && (
            <div style={{ color: 'var(--color-error)', margin: '16px 0' }}>
              {error}
            </div>
          )}

          <Tabs.Content value="upload" className="tabs__content">
            <Dropzone
              onFilesSelected={handleFilesSelected}
              accept=".pdf"
              multiple
            />
            {files.length > 0 && (
              <div className="dropzone__files">
                {files.map((file, index) => (
                  <FileItem
                    key={`${file.name}-${index}`}
                    file={file}
                    progress={uploadProgress[file.name]}
                    onRemove={() => handleRemoveFile(index)}
                  />
                ))}
              </div>
            )}
            <form id="upload-form">
              <InputGroup label="Comment (optional)" htmlFor="upload-comment">
                <Input
                  id="upload-comment"
                  name="comment"
                  placeholder="Add a note about this document"
                />
              </InputGroup>
            </form>
            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                isLoading={loading}
                disabled={files.length === 0}
              >
                Upload {files.length > 0 && `(${files.length})`}
              </Button>
            </ModalFooter>
          </Tabs.Content>

          <Tabs.Content value="url" className="tabs__content">
            <form onSubmit={handleUrlSubmit} className="form">
              <InputGroup label="URL" htmlFor="url" required>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  placeholder="https://example.com/page"
                  required
                />
              </InputGroup>

              <InputGroup label="Title (optional)" htmlFor="title">
                <Input
                  id="title"
                  name="title"
                  placeholder="Leave empty to auto-detect"
                />
              </InputGroup>

              <InputGroup label="Comment (optional)" htmlFor="comment">
                <Input
                  id="comment"
                  name="comment"
                  placeholder="Add a note about this URL"
                />
              </InputGroup>

              <ModalFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={loading}>
                  Add URL
                </Button>
              </ModalFooter>
            </form>
          </Tabs.Content>
        </Tabs.Root>
      </ModalContent>
    </Modal>
  );
}

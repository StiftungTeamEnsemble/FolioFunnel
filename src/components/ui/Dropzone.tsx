'use client';

import { useState, useRef, DragEvent, ChangeEvent, ReactNode } from 'react';
import '@/styles/components/dropzone.css';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  maxSize?: number; // in bytes
  children?: ReactNode;
}

export function Dropzone({
  onFilesSelected,
  accept = '.pdf',
  multiple = false,
  disabled = false,
  maxSize = 50 * 1024 * 1024, // 50MB default
  children,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter((file) => {
      if (maxSize && file.size > maxSize) return false;
      return true;
    });

    if (files.length > 0) {
      onFilesSelected(multiple ? files : [files[0]]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      onFilesSelected(files);
    }
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const classes = [
    'dropzone',
    isDragging && 'dropzone--active',
    disabled && 'dropzone--disabled',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="dropzone__input"
        disabled={disabled}
      />
      {children || (
        <>
          <svg className="dropzone__icon" viewBox="0 0 48 48" fill="none">
            <path
              d="M24 34V14M24 14l-8 8M24 14l8 8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8 34v4a4 4 0 004 4h24a4 4 0 004-4v-4"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="dropzone__title">
            Drag & drop files here, or{' '}
            <span className="dropzone__browse">browse</span>
          </div>
          <div className="dropzone__description">
            Supports PDF files up to {Math.round(maxSize / 1024 / 1024)}MB
          </div>
        </>
      )}
    </div>
  );
}

interface FileItemProps {
  file: File;
  progress?: number;
  onRemove?: () => void;
}

export function FileItem({ file, progress, onRemove }: FileItemProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="dropzone__file">
      <div className="dropzone__file-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414a2 2 0 00-.586-1.414l-3.414-3.414A2 2 0 0012.586 2H4z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M12 2v4a2 2 0 002 2h4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="dropzone__file-info">
        <div className="dropzone__file-name">{file.name}</div>
        <div className="dropzone__file-size">{formatSize(file.size)}</div>
        {progress !== undefined && progress < 100 && (
          <div className="dropzone__file-progress">
            <div
              className="dropzone__file-progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          className="dropzone__file-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 4L4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

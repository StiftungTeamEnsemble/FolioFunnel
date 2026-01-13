'use client';

import Link from 'next/link';
import { RunStatus } from '@prisma/client';
import '@/styles/components/task-list.css';

interface Task {
  id: string;
  status: RunStatus;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  document: {
    id: string;
    title: string;
  };
  column: {
    id: string;
    name: string;
    key: string;
  };
  project: {
    id: string;
    name: string;
  };
}

interface TaskListProps {
  tasks: Task[];
  emptyMessage?: string;
}

function StatusBadge({ status }: { status: RunStatus }) {
  const statusLabels: Record<RunStatus, string> = {
    pending: 'Pending',
    queued: 'Queued',
    running: 'Running',
    success: 'Success',
    error: 'Error',
  };

  return (
    <span className={`task-list__status task-list__status--${status}`}>
      {statusLabels[status]}
    </span>
  );
}

function formatTime(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return '-';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function TaskList({ tasks, emptyMessage = 'No tasks' }: TaskListProps) {
  if (tasks.length === 0) {
    return <div className="task-list__empty">{emptyMessage}</div>;
  }

  return (
    <div className="task-list">
      <table className="task-list__table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Project</th>
            <th>Document</th>
            <th>Column</th>
            <th>Created</th>
            <th>Duration</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className={`task-list__row task-list__row--${task.status}`}>
              <td>
                <StatusBadge status={task.status} />
              </td>
              <td>
                <Link
                  href={`/projects/${task.project.id}`}
                  className="task-list__link"
                >
                  {task.project.name}
                </Link>
              </td>
              <td className="task-list__document">{task.document.title}</td>
              <td className="task-list__column">{task.column.name}</td>
              <td className="task-list__time">{formatTime(task.createdAt)}</td>
              <td className="task-list__duration">
                {formatDuration(task.startedAt, task.finishedAt)}
              </td>
              <td className="task-list__error">
                {task.error && (
                  <span className="task-list__error-text" title={task.error}>
                    {task.error.substring(0, 50)}
                    {task.error.length > 50 ? '...' : ''}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

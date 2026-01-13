'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import '@/styles/components/sidebar.css';

interface Project {
  id: string;
  name: string;
  role: string;
}

interface SidebarProps {
  projects: Project[];
  currentProjectId?: string;
  user: {
    name?: string | null;
    email?: string | null;
  };
}

export function Sidebar({ projects, currentProjectId, user }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <Link href="/" className="sidebar__brand-link" aria-label="Go to home">
          <div className="sidebar__logo">FF</div>
          <div className="sidebar__brand">FolioFunnel</div>
        </Link>
      </div>

      <div className="sidebar__content">
        <div className="sidebar__section">
          <div className="sidebar__section-title">Projects</div>
          <ul className="sidebar__projects">
            {projects.map((project) => {
              const isActive = pathname === `/projects/${project.id}` || pathname?.startsWith(`/projects/${project.id}/`);
              return (
              <li key={project.id} className="sidebar__project-item">
                <Link
                  href={`/projects/${project.id}`}
                  className={`sidebar__project-link ${
                    isActive ? 'sidebar__project-link--active' : ''
                  }`}
                >
                  <div className="sidebar__project-icon">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="sidebar__project-name">{project.name}</span>
                </Link>
              </li>
              );
            })}
          </ul>
          <div className="sidebar__new-project">
            <Link href="/projects/new" className="sidebar__new-project-btn">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              New Project
            </Link>
          </div>
        </div>

        <div className="sidebar__section">
          <Link
            href="/tasks"
            className={`sidebar__tasks-link ${
              pathname === '/tasks' ? 'sidebar__tasks-link--active' : ''
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 4h12M2 8h12M2 12h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Task Queue
          </Link>
        </div>
      </div>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="sidebar__user-avatar">
            {getInitials(user?.name || user?.email || session?.user?.name || session?.user?.email)}
          </div>
          <div className="sidebar__user-info">
            <div className="sidebar__user-name">
              {user?.name || session?.user?.name || 'User'}
            </div>
            <div className="sidebar__user-email">{user?.email || session?.user?.email}</div>
          </div>
        </div>
        <div className="sidebar__user-actions">
          <Link className="sidebar__user-link" href="/profile">
            Edit profile
          </Link>
          <button
            type="button"
            className="sidebar__user-link sidebar__user-link--button"
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

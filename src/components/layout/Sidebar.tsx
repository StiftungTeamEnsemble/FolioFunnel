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
}

export function Sidebar({ projects, currentProjectId }: SidebarProps) {
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
        <div className="sidebar__logo">FF</div>
        <div className="sidebar__brand">FolioFunnel</div>
      </div>

      <div className="sidebar__content">
        <div className="sidebar__section">
          <div className="sidebar__section-title">Projects</div>
          <ul className="sidebar__projects">
            {projects.map((project) => (
              <li key={project.id} className="sidebar__project-item">
                <Link
                  href={`/projects/${project.id}`}
                  className={`sidebar__project-link ${
                    currentProjectId === project.id
                      ? 'sidebar__project-link--active'
                      : ''
                  }`}
                >
                  <div className="sidebar__project-icon">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="sidebar__project-name">{project.name}</span>
                </Link>
              </li>
            ))}
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
      </div>

      <div className="sidebar__footer">
        <div
          className="sidebar__user"
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
        >
          <div className="sidebar__user-avatar">
            {getInitials(session?.user?.name || session?.user?.email)}
          </div>
          <div className="sidebar__user-info">
            <div className="sidebar__user-name">
              {session?.user?.name || 'User'}
            </div>
            <div className="sidebar__user-email">{session?.user?.email}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { ActionMenu, useLongPress } from '@/components/ActionMenu';
import { getProjects, createProject, deleteProject } from '@/lib/api';
import { PROJECT_ICON_TO_EMOJI } from '@/lib/project-visuals';
import { itemVariants, listTransition } from '@/lib/motion';
import { Project } from '@tracker/shared';

const statusColors: Record<string, string> = {
  active: 'status-active',
  paused: 'status-paused',
  completed: 'status-completed',
  archived: 'status-archived',
};

const priorityColors: Record<string, string> = {
  low: 'badge-low',
  medium: 'badge-medium',
  high: 'badge-high',
  critical: 'badge-critical',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newIcon, setNewIcon] = useState<keyof typeof PROJECT_ICON_TO_EMOJI>('folder');
  const [loading, setLoading] = useState(true);
  const [actionMenu, setActionMenu] = useState<{ isOpen: boolean; projectId: string | null }>({
    isOpen: false,
    projectId: null,
  });

  async function loadProjects() {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const created = await createProject({
        title: newTitle.trim(),
        repositoryUrl: newRepo.trim() || undefined,
        summary: newSummary.trim() || undefined,
        icon: newIcon,
      });
      setProjects((prev) => [created, ...prev]);
      setNewTitle('');
      setNewRepo('');
      setNewSummary('');
      setNewIcon('folder');
      setShowCreate(false);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this project and all its data?')) return;
    const previous = projects;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteProject(id);
    } catch (err) {
      setProjects(previous);
      console.error('Failed to delete project:', err);
    }
  }

  return (
    <AppShell title="Projects">
      {/* Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '✕ Cancel' : '+ New Project'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="glass-card animate-slide-up"
          style={{ padding: '1.25rem', marginBottom: '1.5rem' }}
        >
          <input
            className="input-field"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Project title..."
            required
            autoFocus
            style={{ marginBottom: '0.75rem' }}
          />
          <input
            className="input-field"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            placeholder="Repository URL (optional)"
            style={{ marginBottom: '0.75rem' }}
          />
          <textarea
            className="input-field"
            value={newSummary}
            onChange={(e) => setNewSummary(e.target.value)}
            placeholder="Short summary (optional)"
            rows={2}
            style={{ marginBottom: '1rem', resize: 'vertical' }}
          />
          <select
            className="input-field"
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value as keyof typeof PROJECT_ICON_TO_EMOJI)}
            style={{ marginBottom: '1rem' }}
          >
            {Object.entries(PROJECT_ICON_TO_EMOJI).map(([key, emoji]) => (
              <option key={key} value={key}>
                {emoji} {key}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>
            Create Project
          </button>
        </form>
      )}

      {/* Project list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '3rem 0' }}>
          Loading...
        </div>
      ) : projects.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            color: 'var(--color-text-muted)',
            padding: '4rem 0',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>◈</div>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No projects yet</p>
          <p style={{ fontSize: '0.85rem' }}>Create your first project to get started</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {projects.map((project, idx) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={idx}
                onLongPress={() => setActionMenu({ isOpen: true, projectId: project.id })}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      <ActionMenu
        isOpen={actionMenu.isOpen}
        position={{ x: 0, y: 0 }}
        onClose={() => setActionMenu({ isOpen: false, projectId: null })}
        actions={[
          {
            label: 'Edit Project',
            onClick: () => {
              if (actionMenu.projectId) {
                window.location.href = `/projects/${actionMenu.projectId}?edit=1`;
              }
            },
          },
          {
            label: 'Delete Project',
            variant: 'danger',
            onClick: () => {
              if (actionMenu.projectId) handleDelete(actionMenu.projectId);
            },
          },
        ]}
      />
    </AppShell>
  );
}

function ProjectCard({
  project,
  index,
  onLongPress,
}: {
  project: Project;
  index: number;
  onLongPress: () => void;
}) {
  const longPressHandlers = useLongPress(onLongPress);

  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ ...listTransition, delay: index * 0.03 }}
    >
      <Link
        href={`/projects/${project.id}`}
        className="no-select"
        style={{ textDecoration: 'none', color: 'inherit' }}
        {...longPressHandlers}
      >
        <div
          className="glass-card"
          style={{
            padding: '1.25rem',
            borderColor: project.themeColor || 'var(--color-border-glass)',
            boxShadow: `0 0 0 1px ${project.themeColor || 'transparent'}30, 0 10px 30px rgba(0, 0, 0, 0.2)`,
          }}
        >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>{PROJECT_ICON_TO_EMOJI[project.icon] || '📁'}</span>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, flex: 1 }}>{project.title}</h3>
          <span className={`badge ${statusColors[project.status] || ''}`}>{project.status}</span>
        </div>

        {project.summary && (
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              marginBottom: '0.5rem',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {project.summary}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
          }}
        >
          <span className={`badge ${priorityColors[project.priority] || ''}`}>
            {project.priority}
          </span>
          {project.repositoryUrl && <span>🔗 Repo</span>}
          <span style={{ marginLeft: 'auto' }}>
            {new Date(project.updatedAt).toLocaleDateString()}
          </span>
        </div>
        </div>
      </Link>
    </motion.div>
  );
}

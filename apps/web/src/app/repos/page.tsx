'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { getProjects, syncProjectRepo } from '@/lib/api';
import { itemVariants, listTransition } from '@/lib/motion';
import { Project } from '@tracker/shared';

const syncStatusColors: Record<string, string> = {
  ok: 'status-active',
  syncing: 'status-paused',
  cloning: 'status-paused',
  fetching: 'status-paused',
  pulling: 'status-paused',
  failed: 'badge-critical',
};

export default function ReposPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  async function loadProjects() {
    try {
      const data = await getProjects();
      // Only show projects with a repository URL
      const repoProjects = data.filter((p) => !!p.repositoryUrl);
      setProjects(repoProjects);
      
      // Auto-add any project that is currently syncing to syncingIds
      const activeSyncing = repoProjects
        .filter(p => ['syncing', 'cloning', 'fetching', 'pulling'].includes(p.repoLastSyncStatus || ''))
        .map(p => p.id);
      
      if (activeSyncing.length > 0) {
        setSyncingIds(prev => {
          const next = new Set(prev);
          activeSyncing.forEach(id => next.add(id));
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  // Polling for syncing projects
  useEffect(() => {
    if (syncingIds.size === 0) return;

    const interval = setInterval(async () => {
      try {
        const data = await getProjects();
        const repoProjects = data.filter((p) => !!p.repositoryUrl);
        setProjects(repoProjects);

        const stillSyncing = repoProjects
          .filter(p => ['syncing', 'cloning', 'fetching', 'pulling'].includes(p.repoLastSyncStatus || ''))
          .map(p => p.id);

        setSyncingIds(prev => {
          const next = new Set(prev);
          // Remove those that finished
          for (const id of prev) {
            if (!stillSyncing.includes(id)) {
              next.delete(id);
            }
          }
          // Add those that are still/newly syncing (though newly syncing should be handled by handleSync)
          stillSyncing.forEach(id => next.add(id));
          return next;
        });
      } catch (err) {
        console.error('Polling failed:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncingIds.size]);

  async function handleSync(projectId: string) {
    if (syncingIds.has(projectId)) return;
    
    setSyncingIds(prev => new Set(prev).add(projectId));
    
    // Optimistically update status to syncing if not already
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, repoLastSyncStatus: 'syncing' } : p
    ));

    try {
      await syncProjectRepo(projectId);
      // Reload projects to get updated status/commit
      await loadProjects();
    } catch (err) {
      console.error('Failed to sync repository:', err);
      // Reload projects to get the error status from DB
      await loadProjects();
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }

  return (
    <AppShell title="Repositories">
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
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>⎇</div>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No repositories yet</p>
          <p style={{ fontSize: '0.85rem' }}>Add a repository URL to a project to see it here</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {projects.map((project, idx) => (
              <RepoCard
                key={project.id}
                project={project}
                index={idx}
                isSyncing={syncingIds.has(project.id)}
                onSync={() => handleSync(project.id)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </AppShell>
  );
}

function RepoCard({
  project,
  index,
  isSyncing,
  onSync,
}: {
  project: Project;
  index: number;
  isSyncing: boolean;
  onSync: () => void;
}) {
  const status = project.repoLastSyncStatus || 'never';
  const statusClass = syncStatusColors[status] || 'status-archived';

  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ ...listTransition, delay: index * 0.03 }}
    >
      <div
        className="glass-card"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <Link
              href={`/repos/${project.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <h3
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                  cursor: 'pointer',
                }}
              >
                {project.title}
              </h3>
            </Link>
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
              }}
            >
              {project.repositoryUrl}
            </p>
          </div>
          <span className={`badge ${statusClass}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {isSyncing && (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'inline-block', fontSize: '0.8rem' }}
              >
                ↻
              </motion.span>
            )}
            {status}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {project.repoLastCommitSha && (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Last commit: {project.repoLastCommitSha.slice(0, 7)}
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {project.repoLastSyncAt
                ? `Last sync: ${new Date(project.repoLastSyncAt).toLocaleString()}`
                : 'Never synced'}
            </span>
          </div>

          <button
            className="btn-secondary"
            onClick={(e) => {
              e.preventDefault();
              onSync();
            }}
            disabled={isSyncing}
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', minWidth: '100px' }}
          >
            {isSyncing ? status === 'ok' || status === 'failed' ? 'Syncing...' : status : 'Sync Now'}
          </button>
        </div>

        {project.repoLastSyncError && (
          <div
            style={{
              fontSize: '0.7rem',
              color: 'var(--color-accent-danger)',
              padding: '0.5rem',
              background: 'rgba(255, 45, 85, 0.05)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(255, 45, 85, 0.1)',
            }}
          >
            Error: {project.repoLastSyncError}
          </div>
        )}
      </div>
    </motion.div>
  );
}

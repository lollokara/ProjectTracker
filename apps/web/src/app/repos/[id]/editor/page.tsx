'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RepoFileViewer } from '@/components/RepoFileViewer';
import { createNote } from '@/lib/api';
import { Priority } from '@tracker/shared';
import { ChevronLeft } from 'lucide-react';

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const filePath = searchParams.get('path') || '';

  const [initialLine, setInitialLine] = useState<number | undefined>(undefined);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteForm, setNoteForm] = useState<{
    title: string;
    body: string;
    kind: 'note' | 'snippet' | 'todo';
    priority: Priority;
    sourceType?: 'repo_line' | 'repo_file';
    sourcePath?: string;
    sourceLineStart?: number;
    sourceLineEnd?: number;
    sourceCommitSha?: string;
  }>({
    title: '',
    body: '',
    kind: 'note',
    priority: 'medium',
  });
  const [savingNote, setSavingNote] = useState(false);

  // Parse #L<n> from hash after mount
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#L(\d+)$/);
    if (match) {
      setInitialLine(parseInt(match[1], 10));
    }
  }, []);

  const parentDir = filePath.includes('/')
    ? filePath.split('/').slice(0, -1).join('/')
    : '';

  function handleBack() {
    router.push(`/repos/${id}?path=${encodeURIComponent(parentDir)}`);
  }

  function handleCreateNote(sourceInfo: any) {
    setNoteForm({
      title: sourceInfo.title,
      body: sourceInfo.body,
      kind: sourceInfo.kind || 'note',
      priority: sourceInfo.priority || 'medium',
      sourceType: sourceInfo.sourceType,
      sourcePath: sourceInfo.sourcePath,
      sourceLineStart: sourceInfo.sourceLineStart,
      sourceLineEnd: sourceInfo.sourceLineEnd,
      sourceCommitSha: sourceInfo.sourceCommitSha,
    });
    setShowAddNote(true);
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (savingNote) return;
    setSavingNote(true);
    try {
      await createNote({ projectId: id, ...noteForm });
      setShowAddNote(false);
      alert('Note saved to project!');
    } catch (err) {
      console.error(err);
      alert('Failed to save note');
    } finally {
      setSavingNote(false);
    }
  }

  if (!filePath) {
    return (
      <AppShell title="Editor">
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p style={{ marginBottom: '1rem' }}>No file path specified.</p>
          <button className="btn-secondary" onClick={() => router.push(`/repos/${id}`)}>
            <ChevronLeft size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Back to Repo
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--color-bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <RepoFileViewer
        projectId={id}
        filePath={filePath}
        initialLine={initialLine}
        onBack={handleBack}
        onCreateNote={handleCreateNote}
      />

      {showAddNote && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)' }}>
          <form onSubmit={handleAddNote} className="glass-card animate-slide-up" style={{ padding: '1.25rem', width: '100%', maxWidth: '500px', border: '1px solid var(--color-accent-primary)' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>Create Note from Code</h3>
            {noteForm.sourcePath && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-accent-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-glass)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                <span>📍 {noteForm.sourcePath}:{noteForm.sourceLineStart}</span>
              </div>
            )}
            <input className="input-field" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="Title..." required style={{ marginBottom: '0.75rem' }} autoFocus />
            <textarea className="input-field" value={noteForm.body} onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })} placeholder="Details..." rows={4} style={{ marginBottom: '0.75rem', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select className="input-field" value={noteForm.priority} onChange={(e) => setNoteForm({ ...noteForm, priority: e.target.value as Priority })} style={{ flex: 1 }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn-primary" disabled={savingNote} style={{ flex: 1, opacity: savingNote ? 0.7 : 1 }}>
                {savingNote ? 'Saving...' : 'Save Note'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowAddNote(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

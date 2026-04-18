'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { RepoFileViewer } from '@/components/RepoFileViewer';
import { createNote, listAnchoredNotesForFile } from '@/lib/api';
import { Priority } from '@tracker/shared';
import { ChevronLeft, X } from 'lucide-react';

type AnchoredNote = {
  id: string;
  title: string;
  kind: 'note' | 'snippet' | 'todo';
  priority: 'low' | 'medium' | 'high' | 'critical';
  completedAt: string | null;
  sourceLineStart: number | null;
  sourceLineEnd: number | null;
  createdAt: string;
  snippet: string | null;
};

const KIND_ICON: Record<string, string> = {
  note: '📝',
  snippet: '✂️',
  todo: '✓',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'rgba(100,200,100,0.8)',
  medium: 'rgba(255,200,0,0.8)',
  high: 'rgba(255,120,0,0.8)',
  critical: 'rgba(255,50,50,0.9)',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const filePath = searchParams.get('path') || '';
  const peekParam = searchParams.get('peek');

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

  // Anchored notes state
  const [anchoredNotes, setAnchoredNotes] = useState<AnchoredNote[]>([]);
  const [peekOpen, setPeekOpen] = useState(false);

  // Parse #L<n> from hash after mount
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#L(\d+)$/);
    if (match) {
      setInitialLine(parseInt(match[1], 10));
    }
  }, []);

  // Fetch anchored notes on mount
  useEffect(() => {
    if (!filePath) return;
    listAnchoredNotesForFile(id, filePath)
      .then(({ notes }) => {
        setAnchoredNotes(notes);
        // Auto-open peek sheet if ?peek=notes and there are notes
        if (peekParam === 'notes' && notes.length > 0) {
          setPeekOpen(true);
        }
      })
      .catch(() => {
        // non-fatal — stay at 0 count
      });
  }, [id, filePath, peekParam]);

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
      {/* Notes badge — rendered on top of the viewer in the top-right corner */}
      {anchoredNotes.length > 0 && (
        <button
          onClick={() => setPeekOpen((v) => !v)}
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '1rem',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.72rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '9999px',
            background: 'rgba(255,215,0,0.14)',
            color: 'var(--color-accent-warning, #FFD60A)',
            border: '1px solid rgba(255,215,0,0.25)',
            cursor: 'pointer',
          }}
        >
          📝 {anchoredNotes.length}
        </button>
      )}

      <RepoFileViewer
        projectId={id}
        filePath={filePath}
        initialLine={initialLine}
        onBack={handleBack}
        onCreateNote={handleCreateNote}
      />

      {/* Anchored notes peek sheet */}
      <AnimatePresence>
        {peekOpen && (
          <motion.div
            key="peek-sheet"
            initial={{ translateY: '100%' }}
            animate={{ translateY: '0%' }}
            exit={{ translateY: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              height: '40vh',
              zIndex: 300,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-bg-glass, rgba(18,18,28,0.96))',
              backdropFilter: 'blur(16px)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px 16px 0 0',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                📝 Anchored notes ({anchoredNotes.length})
              </span>
              <button
                onClick={() => setPeekOpen(false)}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 0' }}>
              {anchoredNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => router.push(`/projects/${id}#note-${note.id}`)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    padding: '0.6rem 1rem',
                    cursor: 'pointer',
                    opacity: note.completedAt ? 0.5 : 1,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem' }}>{KIND_ICON[note.kind] ?? '📝'}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        textDecoration: note.completedAt ? 'line-through' : 'none',
                      }}
                    >
                      {note.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '9999px',
                        background: 'rgba(255,255,255,0.06)',
                        color: PRIORITY_COLORS[note.priority] ?? 'inherit',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note.priority}
                    </span>
                    {note.sourceLineStart != null && (
                      <span
                        style={{
                          fontSize: '0.62rem',
                          color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        L{note.sourceLineStart}
                        {note.sourceLineEnd != null && note.sourceLineEnd !== note.sourceLineStart
                          ? `–L${note.sourceLineEnd}`
                          : ''}
                      </span>
                    )}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: '0.62rem',
                        color: 'var(--color-text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {relativeTime(note.createdAt)}
                    </span>
                  </div>
                  {note.snippet && (
                    <p
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-secondary)',
                        margin: 0,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {note.snippet}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

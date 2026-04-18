'use client';

import { useState, useEffect, use, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { ActionMenu, useLongPress } from '@/components/ActionMenu';
import {
  getProject, updateProject, deleteProject,
  getNotes, createNote, updateNote, deleteNote,
  getAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl,
  getReminders, createReminder, deleteReminder,
  getTimeline,
  syncProjectRepo, getProjectRepoTree, getProjectRepoFile, searchProjectRepo,
  listSuggestions, acceptSuggestion, dismissSuggestion,
} from '@/lib/api';
import type { NearDuplicate } from '@/lib/api';
import { PROJECT_ICON_TO_EMOJI } from '@/lib/project-visuals';
import { itemVariants, listTransition } from '@/lib/motion';
import { Project, Note, Attachment, Reminder, Priority, ReminderPreset, ActivityEvent } from '@tracker/shared';

const priorityOptions = ['low', 'medium', 'high', 'critical'] as const;
const statusOptions = ['active', 'paused', 'completed', 'archived'] as const;
const reminderPresets = [
  { value: 'morning', label: '🌅 Morning (9 AM)' },
  { value: 'afternoon', label: '☀️ Afternoon (2 PM)' },
  { value: 'in_1_day', label: '📅 In 1 day' },
  { value: 'in_3_days', label: '📅 In 3 days' },
  { value: 'in_7_days', label: '📅 In 7 days' },
  { value: 'custom', label: '🕐 Custom...' },
] as const;

function getLanguageFromExtension(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx': return 'typescript';
    case 'js':
    case 'jsx': return 'javascript';
    case 'css': return 'css';
    case 'md': return 'markdown';
    case 'json': return 'json';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'sh':
    case 'bash': return 'bash';
    default: return 'clike';
  }
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'notes' | 'todos' | 'attachments' | 'reminders' | 'timeline' | 'suggestions'>('notes');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  // Note/Todo creation
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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const addNoteFormRef = useRef<HTMLFormElement | null>(null);
  const fullEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [showFullscreenEditor, setShowFullscreenEditor] = useState(false);
  const [editorBodyDraft, setEditorBodyDraft] = useState('');
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write');

  // Reminder
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [reminderForm, setReminderForm] = useState<{
    preset: any;
    title: string;
    customDate: string;
    relativeDayPart: '' | 'morning' | 'afternoon';
  }>({
    preset: 'morning',
    title: '',
    customDate: '',
    relativeDayPart: '',
  });
  const [savingReminder, setSavingReminder] = useState(false);
  const addReminderFormRef = useRef<HTMLFormElement | null>(null);

  // Duplicate-detection dialog
  const [dupDialog, setDupDialog] = useState<{
    open: boolean;
    nearDuplicates: NearDuplicate[];
    pendingNote: Parameters<typeof createNote>[0] | null;
  }>({ open: false, nearDuplicates: [], pendingNote: null });

  // Enrichment toast — surfaces auto-filled reminder/priority/source after a note is created
  const [enrichToast, setEnrichToast] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  useEffect(() => {
    if (!enrichToast.open) return;
    const t = setTimeout(() => setEnrichToast((s) => ({ ...s, open: false })), 3500);
    return () => clearTimeout(t);
  }, [enrichToast.open, enrichToast.message]);

  // Action menu
  const [actionMenu, setActionMenu] = useState<{ isOpen: boolean; type: string; item: any }>({
    isOpen: false, type: '', item: null,
  });

  async function loadProject() {
    const p = await getProject(id);
    setProject(p);
    setEditForm(p);
  }

  async function loadNotes() {
    const n = await getNotes(id);
    setNotes(n);
  }

  async function loadAttachments() {
    const a = await getAttachments(id);
    setAttachments(a);
  }

  async function loadReminders() {
    const r = await getReminders(id);
    setReminders(r);
  }

  async function loadTimeline() {
    const t = await getTimeline(id);
    setTimeline(t);
  }

  async function loadSuggestions() {
    try {
      const { suggestions: s } = await listSuggestions(id, { status: 'pending' });
      setSuggestions(s);
    } catch {
      // suggestions are non-critical; silently skip if unavailable
    }
  }

  useEffect(() => {
    loadProject();
    loadNotes();
    loadAttachments();
    loadReminders();
    loadTimeline();
    loadSuggestions();
  }, [id]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (showAddNote && addNoteFormRef.current && target && !addNoteFormRef.current.contains(target)) {
        setShowAddNote(false);
        setEditingNoteId(null);
      }
      if (
        showAddReminder &&
        addReminderFormRef.current &&
        target &&
        !addReminderFormRef.current.contains(target)
      ) {
        setShowAddReminder(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [showAddNote, showAddReminder]);

  async function handleSaveProject() {
    await updateProject(id, {
      title: editForm.title,
      summary: editForm.summary,
      repositoryUrl: editForm.repositoryUrl,
      icon: editForm.icon,
      status: editForm.status,
      priority: editForm.priority,
    });
    setEditing(false);
    loadProject();
  }

  async function handleDeleteProject() {
    if (!confirm('Delete this project and all its data?')) return;
    await deleteProject(id);
    router.push('/projects');
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (savingNote) return;
    setSavingNote(true);
    try {
      if (editingNoteId) {
        await updateNote(editingNoteId, {
          title: noteForm.title,
          body: noteForm.body,
          priority: noteForm.priority,
        });
        setEditingNoteId(null);
      } else {
        const noteData = { projectId: id, ...noteForm };
        const result = await createNote(noteData);
        if (!result.created) {
          // Near-duplicates found — show dialog and pause
          setDupDialog({ open: true, nearDuplicates: result.nearDuplicates, pendingNote: noteData });
          return;
        }
        showEnrichmentToast(result.enrichment);
      }
      setNoteForm({
        title: '',
        body: '',
        kind: noteForm.kind,
        priority: 'medium',
        sourceType: undefined,
        sourcePath: undefined,
        sourceLineStart: undefined,
        sourceLineEnd: undefined,
        sourceCommitSha: undefined,
      });
      setShowAddNote(false);
      loadNotes();
      loadTimeline();
    } finally {
      setSavingNote(false);
    }
  }

  function showEnrichmentToast(enrichment: {
    reminderAt: string | null;
    priorityApplied: boolean;
    sourcePathApplied: boolean;
    tags: string[];
    mentions: string[];
  } | undefined) {
    if (!enrichment) return;
    const parts: string[] = [];
    if (enrichment.reminderAt) {
      const when = new Date(enrichment.reminderAt);
      const whenStr = when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      parts.push(`⏰ Reminder set for ${whenStr}`);
    }
    if (enrichment.priorityApplied) parts.push('🏷 Priority auto-set');
    if (enrichment.sourcePathApplied) parts.push('📎 Source file auto-linked');
    if (enrichment.tags.length > 0) parts.push(`#${enrichment.tags.join(' #')}`);
    if (parts.length === 0) return;
    setEnrichToast({ open: true, message: parts.join(' · ') });
  }

  async function handleForceCreateNote() {
    if (!dupDialog.pendingNote) return;
    setSavingNote(true);
    try {
      const result = await createNote({ ...dupDialog.pendingNote, force: true });
      if (result.created) showEnrichmentToast(result.enrichment);
      setDupDialog({ open: false, nearDuplicates: [], pendingNote: null });
      setNoteForm({
        title: '',
        body: '',
        kind: noteForm.kind,
        priority: 'medium',
        sourceType: undefined,
        sourcePath: undefined,
        sourceLineStart: undefined,
        sourceLineEnd: undefined,
        sourceCommitSha: undefined,
      });
      setShowAddNote(false);
      loadNotes();
      loadTimeline();
    } finally {
      setSavingNote(false);
    }
  }

  async function handleToggleTodo(noteId: string, completedAt: string | null) {
    await updateNote(noteId, {
      completedAt: completedAt ? null : new Date().toISOString(),
    });
    loadNotes();
    loadTimeline();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('projectId', id);
    await uploadAttachment(formData);
    loadAttachments();
    loadTimeline();
    e.target.value = '';
  }

  async function handleAddReminder(e: React.FormEvent) {
    e.preventDefault();
    if (savingReminder) return;
    setSavingReminder(true);
    try {
      let preset = reminderForm.preset as string;
      let scheduledFor: string | undefined;

      if (reminderForm.preset === 'custom') {
        scheduledFor = new Date(reminderForm.customDate).toISOString();
      } else if (['in_1_day', 'in_3_days', 'in_7_days'].includes(reminderForm.preset)) {
        if (!reminderForm.relativeDayPart) {
          alert('Choose morning or afternoon for this reminder');
          return;
        }
        const daysMap: Record<string, number> = { in_1_day: 1, in_3_days: 3, in_7_days: 7 };
        const days = daysMap[reminderForm.preset] ?? 1;
        const target = new Date();
        target.setDate(target.getDate() + days);
        target.setHours(reminderForm.relativeDayPart === 'morning' ? 9 : 14, 0, 0, 0);
        scheduledFor = target.toISOString();
        preset = 'custom';
      }

      await createReminder({
        projectId: id,
        preset: preset as ReminderPreset,
        title: reminderForm.title || project?.title || 'Reminder',
        scheduledFor,
      });
      setShowAddReminder(false);
      setReminderForm({ preset: 'morning', title: '', customDate: '', relativeDayPart: '' });
      loadReminders();
      loadTimeline();
    } finally {
      setSavingReminder(false);
    }
  }

  async function handleEditNote(note: any) {
    setEditingNoteId(note.id);
    setNoteForm({
      title: note.title || '',
      body: note.body || '',
      kind: note.kind || (activeTab === 'todos' ? 'todo' : 'note'),
      priority: note.priority || 'medium',
    });
    setShowAddNote(true);
  }

  function openFullscreenEditor() {
    setEditorBodyDraft(noteForm.body || '');
    setEditorTab('write');
    setShowFullscreenEditor(true);
  }

  function applyFullscreenEditor() {
    setNoteForm((prev) => ({ ...prev, body: editorBodyDraft }));
    setShowFullscreenEditor(false);
  }

  function wrapSelection(before: string, after = before) {
    const textarea = fullEditorRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = editorBodyDraft.slice(start, end);
    const next = `${editorBodyDraft.slice(0, start)}${before}${selected}${after}${editorBodyDraft.slice(end)}`;
    setEditorBodyDraft(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + before.length + selected.length + after.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  useEffect(() => {
    if (!showFullscreenEditor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowFullscreenEditor(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        applyFullscreenEditor();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => fullEditorRef.current?.focus());
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showFullscreenEditor, editorBodyDraft]);

  if (!project) {
    return (
      <div style={{ '--color-accent-primary': '#00ffc8', '--color-accent-primary-rgb': '0, 255, 200' } as any}>
      <AppShell title="Loading...">
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '3rem' }}>
          Loading project...
        </div>
      </AppShell>
      </div>
    );
  }

  const tabStyle = (tab: string) => ({
    padding: '0.5rem 1rem',
    fontSize: '0.8rem',
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
    background: activeTab === tab ? 'rgba(0, 255, 200, 0.08)' : 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const,
  });

  const filteredNotes = notes.filter((n) =>
    activeTab === 'todos' ? n.kind === 'todo' : n.kind !== 'todo',
  );

  return (
    <div style={{ 
      '--color-accent-primary': project.themeColor, 
      '--color-accent-primary-rgb': hexToRgb(project.themeColor) || project.themeColor 
    } as any}>
    <AppShell title={`${PROJECT_ICON_TO_EMOJI[project.icon] || '📁'} ${project.title}`}>
      {/* Project header */}
      {!editing ? (
        <div
          className="glass-card animate-fade-in"
          style={{
            padding: '1.25rem',
            marginBottom: '1rem',
            borderColor: project.themeColor || 'var(--color-border-glass)',
            boxShadow: `0 0 0 1px ${project.themeColor || 'transparent'}30, 0 10px 30px rgba(0, 0, 0, 0.2)`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{PROJECT_ICON_TO_EMOJI[project.icon] || '📁'}</span>
                <span>{project.title}</span>
              </h2>
              {project.summary && (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {project.summary}
                </p>
              )}
            </div>
            <button className="btn-secondary" onClick={() => setEditing(true)} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>
              Edit
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
            <span className={`badge status-${project.status}`}>{project.status}</span>
            <span className={`badge badge-${project.priority}`}>{project.priority}</span>
            {project.repositoryUrl && (
              <a href={project.repositoryUrl} target="_blank" rel="noopener" style={{ color: 'var(--color-accent-primary)', textDecoration: 'none' }}>
                🔗 Repository
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card animate-fade-in" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <input className="input-field" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={{ marginBottom: '0.75rem' }} />
          <textarea className="input-field" value={editForm.summary || ''} onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })} rows={2} style={{ marginBottom: '0.75rem', resize: 'vertical' }} />
          <input className="input-field" value={editForm.repositoryUrl || ''} onChange={(e) => setEditForm({ ...editForm, repositoryUrl: e.target.value })} placeholder="Repository URL" style={{ marginBottom: '0.75rem' }} />
          <select
            className="input-field"
            value={editForm.icon || 'folder'}
            onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
            style={{ marginBottom: '0.75rem' }}
          >
            {Object.entries(PROJECT_ICON_TO_EMOJI).map(([key, emoji]) => <option key={key} value={key}>{emoji} {key}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <select className="input-field" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} style={{ flex: 1 }}>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input-field" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })} style={{ flex: 1 }}>
              {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-primary" onClick={handleSaveProject} style={{ flex: 1 }}>Save</button>
            <button className="btn-secondary" onClick={() => { setEditing(false); setEditForm(project); }}>Cancel</button>
            <button className="btn-danger" onClick={handleDeleteProject} style={{ padding: '0.5rem 0.75rem' }}>🗑</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.25rem' }}>
        {(['notes', 'todos', 'attachments', 'reminders', 'timeline'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <button onClick={() => setActiveTab('suggestions')} style={tabStyle('suggestions')}>
          Suggestions{suggestions.length > 0 ? ` (${suggestions.length})` : ''}
        </button>
      </div>

      {/* Tab content */}
      {(activeTab === 'notes' || activeTab === 'todos') && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn-primary" onClick={() => { 
              setShowAddNote(!showAddNote); 
              setNoteForm({ 
                title: '', 
                body: '', 
                kind: activeTab === 'todos' ? 'todo' : 'note', 
                priority: 'medium' 
              }); 
            }}>
              {showAddNote ? 'Close' : `+ Add ${activeTab === 'todos' ? 'Todo' : 'Note'}`}
            </button>
          </div>
          {showAddNote && (
            <form ref={addNoteFormRef} onSubmit={handleAddNote} className="glass-card animate-slide-up" style={{ padding: '1rem', marginBottom: '1rem' }}>
              {noteForm.sourcePath && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-accent-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>📍 {noteForm.sourcePath}:{noteForm.sourceLineStart}</span>
                  <button 
                    type="button" 
                    onClick={() => setNoteForm({...noteForm, sourceType: undefined, sourcePath: undefined, sourceLineStart: undefined, sourceLineEnd: undefined, sourceCommitSha: undefined})}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0 0.25rem' }}
                  >
                    ✕
                  </button>
                </div>
              )}
              <input className="input-field" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="Title..." required style={{ marginBottom: '0.5rem' }} autoFocus />
              <textarea className="input-field" value={noteForm.body} onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })} placeholder="Details..." rows={3} style={{ marginBottom: '0.5rem', resize: 'vertical' }} />
              <button
                type="button"
                className="btn-secondary"
                onClick={openFullscreenEditor}
                style={{ width: '100%', marginBottom: '0.5rem' }}
              >
                ⛶ Fullscreen Editor
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select className="input-field" value={noteForm.priority} onChange={(e) => setNoteForm({ ...noteForm, priority: e.target.value as Priority })} style={{ flex: 1 }}>
                  {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button type="submit" className="btn-primary" disabled={savingNote} style={{ opacity: savingNote ? 0.7 : 1 }}>
                  {savingNote ? 'Saving...' : editingNoteId ? 'Save Changes' : 'Save'}
                </button>
              </div>
            </form>
          )}
          {filteredNotes.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
              No {activeTab} yet
            </p>
          ) : (
            <AnimatePresence initial={false}>
              <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isTodo={activeTab === 'todos'}
                    onToggle={() => handleToggleTodo(note.id, note.completedAt)}
                    onLongPress={() => setActionMenu({ isOpen: true, type: 'note', item: note })}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {activeTab === 'attachments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <label className="btn-primary" style={{ cursor: 'pointer' }}>
              + Upload
              <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,.pdf,.txt,.md,.zip" />
            </label>
          </div>
          {attachments.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
              No attachments yet
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
              {attachments.map((att) => (
                <AttachmentCard
                  key={att.id}
                  attachment={att}
                  onLongPress={() => setActionMenu({ isOpen: true, type: 'attachment', item: att })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reminders' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn-primary" onClick={() => setShowAddReminder(!showAddReminder)}>
              + New Reminder
            </button>
          </div>
          {showAddReminder && (
            <form ref={addReminderFormRef} onSubmit={handleAddReminder} className="glass-card animate-slide-up" style={{ padding: '1rem', marginBottom: '1rem' }}>
              <input className="input-field" value={reminderForm.title} onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })} placeholder="Reminder title..." style={{ marginBottom: '0.5rem' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {reminderPresets.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() =>
                      setReminderForm({
                        ...reminderForm,
                        preset: p.value,
                        relativeDayPart:
                          ['in_1_day', 'in_3_days', 'in_7_days'].includes(p.value) ?
                            reminderForm.relativeDayPart :
                            '',
                      })
                    }
                    style={{
                      padding: '0.625rem',
                      fontSize: '0.8rem',
                      background: reminderForm.preset === p.value ? 'rgba(0, 255, 200, 0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${reminderForm.preset === p.value ? 'var(--color-accent-primary)' : 'var(--color-border-glass)'}`,
                      borderRadius: 'var(--radius-md)',
                      color: reminderForm.preset === p.value ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {['in_1_day', 'in_3_days', 'in_7_days'].includes(reminderForm.preset) && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {[
                    { value: 'morning', label: '🌅 Morning' },
                    { value: 'afternoon', label: '☀️ Afternoon' },
                  ].map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setReminderForm({ ...reminderForm, relativeDayPart: slot.value as 'morning' | 'afternoon' })}
                      style={{
                        flex: 1,
                        padding: '0.625rem',
                        fontSize: '0.8rem',
                        background: reminderForm.relativeDayPart === slot.value ? 'rgba(0, 255, 200, 0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${reminderForm.relativeDayPart === slot.value ? 'var(--color-accent-primary)' : 'var(--color-border-glass)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: reminderForm.relativeDayPart === slot.value ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
              {reminderForm.preset === 'custom' && (
                <input
                  type="datetime-local"
                  className="input-field"
                  value={reminderForm.customDate}
                  onChange={(e) => setReminderForm({ ...reminderForm, customDate: e.target.value })}
                  required
                  style={{ marginBottom: '0.5rem' }}
                />
              )}
              <button type="submit" className="btn-primary" disabled={savingReminder} style={{ width: '100%', opacity: savingReminder ? 0.7 : 1 }}>
                {savingReminder ? 'Scheduling...' : 'Schedule'}
              </button>
            </form>
          )}
          {reminders.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
              No reminders yet
            </p>
          ) : (
            <AnimatePresence initial={false}>
              <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {reminders.map((rem) => (
                  <motion.div
                    key={rem.id}
                    layout
                    variants={itemVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={listTransition}
                    className="glass-card"
                    style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                  >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      {(rem.notificationPayload as any)?.title || 'Reminder'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {new Date(rem.scheduledFor).toLocaleString()} · {rem.presetSource}
                    </div>
                  </div>
                  <span className={`badge ${rem.status === 'pending' ? 'badge-medium' : rem.status === 'delivered' ? 'status-completed' : 'badge-critical'}`}>
                    {rem.status}
                  </span>
                  <button
                    onClick={async () => {
                      const previous = reminders;
                      setReminders((prev) => prev.filter((r) => r.id !== rem.id));
                      try {
                        await deleteReminder(rem.id);
                        loadTimeline();
                      } catch {
                        setReminders(previous);
                      }
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                    title="Delete reminder"
                  >
                    ✕
                  </button>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      

      {activeTab === 'timeline' && (
        <div>
          {timeline.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
              No activity yet
            </p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
              {/* Timeline line */}
              <div style={{ position: 'absolute', left: '0.5rem', top: 0, bottom: 0, width: '2px', background: 'var(--color-border-glass)' }} />
              {timeline.map((event, idx) => (
                <div key={event.id} style={{ position: 'relative', marginBottom: '1rem', animation: `fade-in 0.3s ease-out ${idx * 0.03}s both` }}>
                  <div style={{ position: 'absolute', left: '-1.25rem', top: '0.5rem', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-accent-primary)', boxShadow: '0 0 8px rgba(0,255,200,0.3)' }} />
                  <div className="glass-card" style={{ padding: '0.875rem', marginLeft: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                      {formatEventType(event.eventType)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {new Date(event.occurredAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'suggestions' && (
        <div>
          {suggestions.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
              No pending suggestions — run a re-index to scan for TODO/FIXME comments
            </p>
          ) : (
            <AnimatePresence initial={false}>
              <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    projectId={id}
                    onAccepted={() => setSuggestions((prev) => prev.filter((x) => x.id !== s.id))}
                    onDismissed={() => setSuggestions((prev) => prev.filter((x) => x.id !== s.id))}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Enrichment toast (auto-filled reminder / priority / tags) */}
      <AnimatePresence>
        {enrichToast.open && (
          <motion.div
            key="enrich-toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              left: '50%',
              bottom: '5rem',
              transform: 'translateX(-50%)',
              zIndex: 1100,
              padding: '0.6rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0, 245, 255, 0.12)',
              border: '1px solid rgba(0, 245, 255, 0.35)',
              color: 'var(--color-text-primary)',
              fontSize: '0.82rem',
              fontFamily: 'var(--font-mono)',
              boxShadow: '0 6px 24px rgba(0, 245, 255, 0.18)',
              maxWidth: 'calc(100vw - 2rem)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            onClick={() => setEnrichToast((s) => ({ ...s, open: false }))}
          >
            {enrichToast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Near-duplicate detection dialog */}
      <AnimatePresence>
        {dupDialog.open && (
          <motion.div
            key="dup-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              background: 'rgba(3, 6, 20, 0.82)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
          >
            <motion.div
              key="dup-dialog"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '520px',
                padding: '1.5rem',
                border: '1px solid rgba(0, 255, 200, 0.3)',
                boxShadow: '0 0 40px rgba(0, 255, 200, 0.08)',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--color-accent-primary)' }}>
                Similar notes found
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                These existing notes look very similar. Consider extending one instead of creating a duplicate.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
                {dupDialog.nearDuplicates.map((dup) => (
                  <a
                    key={dup.id}
                    href={`/projects/${id}#note-${dup.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                    onClick={() => setDupDialog({ open: false, nearDuplicates: [], pendingNote: null })}
                  >
                    <div
                      className="glass-card"
                      style={{
                        padding: '0.875rem',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease',
                        border: '1px solid var(--color-border-glass)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent-primary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-glass)')}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', flex: 1 }}>{dup.title}</span>
                        <span
                          style={{
                            flexShrink: 0,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: 'rgba(0, 255, 200, 0.12)',
                            color: 'var(--color-accent-primary)',
                            border: '1px solid rgba(0, 255, 200, 0.25)',
                          }}
                        >
                          {Math.round(dup.similarity * 100)}% match
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: dup.snippet ? '0.375rem' : 0 }}>
                        <span className={`badge badge-${dup.priority}`} style={{ fontSize: '0.68rem' }}>{dup.priority}</span>
                        <span className="badge" style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>{dup.kind}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                          {new Date(dup.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {dup.snippet && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {dup.snippet}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={handleForceCreateNote}
                  disabled={savingNote}
                >
                  {savingNote ? 'Creating...' : 'Create anyway'}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => setDupDialog({ open: false, nearDuplicates: [], pendingNote: null })}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showFullscreenEditor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(3, 6, 20, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'center',
            padding: '0.5rem',
          }}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '1000px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '0',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => wrapSelection('**')}>
                Bold
              </button>
              <button type="button" className="btn-secondary" onClick={() => wrapSelection('*')}>
                Italic
              </button>
              <button type="button" className="btn-secondary" onClick={() => wrapSelection('`')}>
                Code
              </button>
              <button type="button" className="btn-secondary" onClick={() => wrapSelection('\\n- ', '')}>
                List
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditorTab(editorTab === 'write' ? 'preview' : 'write')}>
                {editorTab === 'write' ? 'Preview' : 'Write'}
              </button>
              <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: '0.75rem', alignSelf: 'center' }}>
                Esc to close • Cmd/Ctrl+S to apply
              </span>
            </div>

            {editorTab === 'write' ? (
              <textarea
                ref={fullEditorRef}
                className="input-field"
                value={editorBodyDraft}
                onChange={(e) => setEditorBodyDraft(e.target.value)}
                style={{
                  flex: 1,
                  minHeight: '50vh',
                  resize: 'none',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.6,
                }}
                placeholder="Write your note..."
              />
            ) : (
              <pre
                className="glass-card"
                style={{
                  flex: 1,
                  minHeight: '50vh',
                  margin: 0,
                  padding: '1rem',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {editorBodyDraft || 'Nothing to preview yet.'}
              </pre>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
              <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={applyFullscreenEditor}>
                Apply
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowFullscreenEditor(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Menu */}
      <ActionMenu
        isOpen={actionMenu.isOpen}
        position={{ x: 0, y: 0 }}
        onClose={() => setActionMenu({ isOpen: false, type: '', item: null })}
        actions={
          actionMenu.type === 'note'
            ? [
                { label: 'Edit', onClick: async () => { await handleEditNote(actionMenu.item); } },
                { label: 'Delete', variant: 'danger', onClick: async () => { await deleteNote(actionMenu.item.id); loadNotes(); loadTimeline(); } },
              ]
            : actionMenu.type === 'attachment'
            ? [
                { label: 'Delete', variant: 'danger', onClick: async () => { await deleteAttachment(actionMenu.item.id); loadAttachments(); loadTimeline(); } },
              ]
            : []
        }
      />
    </AppShell>
    </div>
  );
}

function NoteCard({ note, isTodo, onToggle, onLongPress }: { note: Note; isTodo: boolean; onToggle: () => void; onLongPress: () => void }) {
  const longPressHandlers = useLongPress(onLongPress);
  const isCompleted = !!note.completedAt;

  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={listTransition}
      className="glass-card no-select"
      style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
      {...longPressHandlers}
    >
      {isTodo && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          style={{
            width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0, marginTop: '2px',
            border: `2px solid ${isCompleted ? 'var(--color-accent-primary)' : 'var(--color-border-glass)'}`,
            background: isCompleted ? 'var(--color-accent-primary)' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-bg-primary)', fontSize: '0.75rem', fontWeight: 700,
            transition: 'all 0.2s ease',
          }}
        >
          {isCompleted && '✓'}
        </button>
      )}
      <div style={{ flex: 1, opacity: isCompleted ? 0.5 : 1 }}>
        <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.25rem', textDecoration: isCompleted ? 'line-through' : 'none' }}>
          {note.title}
        </div>
        {note.sourcePath && (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-accent-primary)', marginBottom: '0.25rem' }}>
            {note.sourcePath}
            {note.sourceLineStart ? `:${note.sourceLineStart}` : ''}
            {note.sourceLineEnd && note.sourceLineEnd !== note.sourceLineStart ? `-${note.sourceLineEnd}` : ''}
          </div>
        )}
        {note.body && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {note.body}
          </p>
        )}
      </div>
      <span className={`badge badge-${note.priority}`} style={{ flexShrink: 0 }}>{note.priority}</span>
    </motion.div>
  );
}


function formatEventType(type: string): string {
  const map: Record<string, string> = {
    project_created: '📁 Project created',
    project_updated: '✏️ Project updated',
    project_deleted: '🗑 Project deleted',
    note_created: '📝 Note added',
    note_updated: '✏️ Note updated',
    note_deleted: '🗑 Note deleted',
    todo_completed: '✅ Todo completed',
    todo_uncompleted: '↻ Todo uncompleted',
    attachment_added: '📎 Attachment added',
    attachment_removed: '🗑 Attachment removed',
    reminder_created: '⏰ Reminder set',
    reminder_delivered: '🔔 Reminder delivered',
    device_paired: '📱 Device paired',
    device_revoked: '🚫 Device revoked',
  };
  return map[type] || type;
}

const KEYWORD_COLORS: Record<string, { bg: string; color: string }> = {
  TODO:  { bg: 'rgba(255, 138, 0, 0.15)',  color: '#FF8A00' },
  FIXME: { bg: 'rgba(255, 45, 85, 0.15)',  color: '#FF2D55' },
  HACK:  { bg: 'rgba(255, 214, 10, 0.15)', color: '#FFD60A' },
  XXX:   { bg: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' },
  NOTE:  { bg: 'rgba(0, 245, 255, 0.1)',   color: '#00F5FF' },
};

function SuggestionCard({
  suggestion,
  projectId,
  onAccepted,
  onDismissed,
}: {
  suggestion: any;
  projectId: string;
  onAccepted: () => void;
  onDismissed: () => void;
}) {
  const [acting, setActing] = useState(false);
  const kw = (suggestion.keyword as string).toUpperCase();
  const kwStyle = KEYWORD_COLORS[kw] ?? KEYWORD_COLORS['NOTE'];

  async function handleAccept() {
    if (acting) return;
    setActing(true);
    try {
      await acceptSuggestion(projectId, suggestion.id);
      onAccepted();
    } catch {
      setActing(false);
    }
  }

  async function handleDismiss() {
    if (acting) return;
    setActing(true);
    try {
      await dismissSuggestion(projectId, suggestion.id);
      onDismissed();
    } catch {
      setActing(false);
    }
  }

  const editorHref = `/repos/${projectId}/editor?path=${encodeURIComponent(suggestion.filePath)}#L${suggestion.lineNumber}`;

  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={listTransition}
      className="glass-card"
      style={{ padding: '0.875rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', opacity: acting ? 0.5 : 1 }}
    >
      <span
        style={{
          flexShrink: 0,
          padding: '0.2rem 0.5rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          background: kwStyle.bg,
          color: kwStyle.color,
          border: `1px solid ${kwStyle.color}40`,
        }}
      >
        {kw}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: '0.25rem',
          }}
          title={suggestion.text}
        >
          {suggestion.text}
        </div>
        <a
          href={editorHref}
          style={{
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          {suggestion.filePath}:{suggestion.lineNumber}
        </a>
      </div>
      <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
        <button
          onClick={handleAccept}
          disabled={acting}
          className="btn-primary"
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
          title="Accept — creates a todo note"
        >
          ✓ Accept
        </button>
        <button
          onClick={handleDismiss}
          disabled={acting}
          className="btn-secondary"
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
          title="Dismiss — won't re-appear"
        >
          ✗ Dismiss
        </button>
      </div>
    </motion.div>
  );
}

function AttachmentCard({ attachment, onLongPress }: { attachment: Attachment; onLongPress: () => void }) {
  const longPressHandlers = useLongPress(onLongPress);
  const isImage = attachment.type === 'image';

  return (
    <a href={getAttachmentUrl(attachment.id)} target="_blank" rel="noopener" className="no-select" style={{ textDecoration: 'none', color: 'inherit' }} {...longPressHandlers}>
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {isImage ? (
          <div style={{ aspectRatio: '1', background: 'var(--color-bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={getAttachmentUrl(attachment.id)} alt={attachment.caption || attachment.originalName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          </div>
        ) : (
          <div style={{ aspectRatio: '1', background: 'var(--color-bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
            📄
          </div>
        )}
        <div style={{ padding: '0.625rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachment.originalName}
          </div>
        </div>
      </div>
    </a>
  );
}

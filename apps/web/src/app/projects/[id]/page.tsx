'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ActionMenu, useLongPress } from '@/components/ActionMenu';
import {
  getProject, updateProject, deleteProject,
  getNotes, createNote, updateNote, deleteNote,
  getAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl,
  getReminders, createReminder, deleteReminder,
  getTimeline,
} from '@/lib/api';

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

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'notes' | 'todos' | 'attachments' | 'reminders' | 'timeline'>('notes');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  // Note/Todo creation
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: '', body: '', kind: 'note', priority: 'medium' });
  const addNoteFormRef = useRef<HTMLFormElement | null>(null);

  // Reminder
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [reminderForm, setReminderForm] = useState({ preset: 'morning', title: '', customDate: '' });
  const addReminderFormRef = useRef<HTMLFormElement | null>(null);

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

  useEffect(() => {
    loadProject();
    loadNotes();
    loadAttachments();
    loadReminders();
    loadTimeline();
  }, [id]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (showAddNote && addNoteFormRef.current && target && !addNoteFormRef.current.contains(target)) {
        setShowAddNote(false);
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
    await createNote({
      projectId: id,
      ...noteForm,
    });
    setNoteForm({ title: '', body: '', kind: noteForm.kind, priority: 'medium' });
    setShowAddNote(false);
    loadNotes();
    loadTimeline();
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
    await createReminder({
      projectId: id,
      preset: reminderForm.preset,
      title: reminderForm.title || project?.title || 'Reminder',
      scheduledFor: reminderForm.preset === 'custom' ? new Date(reminderForm.customDate).toISOString() : undefined,
    });
    setShowAddReminder(false);
    setReminderForm({ preset: 'morning', title: '', customDate: '' });
    loadReminders();
    loadTimeline();
  }

  async function handleEditNote(note: any) {
    const title = prompt('Edit title', note.title);
    if (title === null) return;
    const body = prompt('Edit details', note.body || '');
    if (body === null) return;
    await updateNote(note.id, { title, body });
    loadNotes();
    loadTimeline();
  }

  if (!project) {
    return (
      <AppShell title="Loading...">
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '3rem' }}>
          Loading project...
        </div>
      </AppShell>
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
    <AppShell title={project.title}>
      {/* Project header */}
      {!editing ? (
        <div className="glass-card animate-fade-in" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{project.title}</h2>
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
      </div>

      {/* Tab content */}
      {(activeTab === 'notes' || activeTab === 'todos') && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button className="btn-primary" onClick={() => { setShowAddNote(!showAddNote); setNoteForm({ ...noteForm, kind: activeTab === 'todos' ? 'todo' : 'note' }); }}>
              + Add {activeTab === 'todos' ? 'Todo' : 'Note'}
            </button>
          </div>
          {showAddNote && (
            <form ref={addNoteFormRef} onSubmit={handleAddNote} className="glass-card animate-slide-up" style={{ padding: '1rem', marginBottom: '1rem' }}>
              <input className="input-field" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="Title..." required style={{ marginBottom: '0.5rem' }} autoFocus />
              <textarea className="input-field" value={noteForm.body} onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })} placeholder="Details..." rows={3} style={{ marginBottom: '0.5rem', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select className="input-field" value={noteForm.priority} onChange={(e) => setNoteForm({ ...noteForm, priority: e.target.value })} style={{ flex: 1 }}>
                  {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          )}
          {filteredNotes.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
              No {activeTab} yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isTodo={activeTab === 'todos'}
                  onToggle={() => handleToggleTodo(note.id, note.completedAt)}
                  onLongPress={() => setActionMenu({ isOpen: true, type: 'note', item: note })}
                />
              ))}
            </div>
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
                    onClick={() => setReminderForm({ ...reminderForm, preset: p.value })}
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
              <button type="submit" className="btn-primary" style={{ width: '100%' }}>Schedule</button>
            </form>
          )}
          {reminders.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
              No reminders yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {reminders.map((rem) => (
                <div key={rem.id} className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                      await deleteReminder(rem.id);
                      loadReminders();
                      loadTimeline();
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                    title="Delete reminder"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
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
  );
}

function NoteCard({ note, isTodo, onToggle, onLongPress }: { note: any; isTodo: boolean; onToggle: () => void; onLongPress: () => void }) {
  const longPressHandlers = useLongPress(onLongPress);
  const isCompleted = !!note.completedAt;

  return (
    <div className="glass-card no-select" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }} {...longPressHandlers}>
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
        {note.body && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {note.body}
          </p>
        )}
      </div>
      <span className={`badge badge-${note.priority}`} style={{ flexShrink: 0 }}>{note.priority}</span>
    </div>
  );
}

function AttachmentCard({ attachment, onLongPress }: { attachment: any; onLongPress: () => void }) {
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

import {
  Project,
  Note,
  Attachment,
  Reminder,
  CreateProjectInput,
  UpdateProjectInput,
  CreateNoteInput,
  UpdateNoteInput,
  CreateReminderInput,
} from '@tracker/shared';

const API_BASE = '';

async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────
export async function checkSession() {
  return fetchAPI<{ authenticated: boolean; deviceId?: string; deviceLabel?: string }>(
    '/api/auth/session',
  );
}

export async function pairDevice(token: string, deviceLabel: string) {
  return fetchAPI<{ success: boolean; device: { id: string; label: string } }>(
    '/api/auth/pair',
    { method: 'POST', body: JSON.stringify({ token, deviceLabel }) },
  );
}

export async function generateToken() {
  return fetchAPI<{ token: string; expiresAt: string }>('/api/auth/generate-token', {
    method: 'POST',
  });
}

export async function logout() {
  return fetchAPI<{ success: boolean }>('/api/auth/session', { method: 'DELETE' });
}

// ── Projects ─────────────────────────────────────────────────────────
export async function getProjects(status?: string) {
  const params = status ? `?status=${status}` : '';
  return fetchAPI<Project[]>(`/api/projects${params}`);
}

export async function getProject(id: string) {
  return fetchAPI<Project>(`/api/projects/${id}`);
}

export async function createProject(data: CreateProjectInput) {
  return fetchAPI<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateProject(id: string, data: UpdateProjectInput) {
  return fetchAPI<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteProject(id: string) {
  return fetchAPI<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
}

// ── Notes ────────────────────────────────────────────────────────────
export async function getNotes(projectId: string, kind?: string) {
  const params = new URLSearchParams({ projectId });
  if (kind) params.set('kind', kind);
  return fetchAPI<Note[]>(`/api/notes?${params}`);
}

export type NearDuplicate = {
  id: string;
  title: string;
  snippet: string;
  kind: string;
  priority: string;
  createdAt: string;
  similarity: number;
};

export type NoteEnrichmentApplied = {
  reminderAt: string | null;
  priorityApplied: boolean;
  sourcePathApplied: boolean;
  tags: string[];
  mentions: string[];
  kindApplied?: boolean;
  kindConfidence?: number;
  suggestedKind?: string;
};

export type CreateNoteResult =
  | { created: true; note: Note; enrichment: NoteEnrichmentApplied }
  | { created: false; nearDuplicates: NearDuplicate[] };

export async function createNote(data: CreateNoteInput & { force?: boolean }): Promise<CreateNoteResult> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function updateNote(id: string, data: UpdateNoteInput) {
  return fetchAPI<Note>(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteNote(id: string) {
  return fetchAPI<{ success: boolean }>(`/api/notes/${id}`, { method: 'DELETE' });
}

// ── Attachments ──────────────────────────────────────────────────────
export async function getAttachments(projectId: string) {
  return fetchAPI<Attachment[]>(`/api/attachments?projectId=${projectId}`);
}

export async function uploadAttachment(formData: FormData) {
  const res = await fetch('/api/attachments', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }
  return res.json() as Promise<Attachment>;
}

export async function deleteAttachment(id: string) {
  return fetchAPI<{ success: boolean }>(`/api/attachments/${id}`, { method: 'DELETE' });
}

export function getAttachmentUrl(id: string) {
  return `/api/attachments/${id}`;
}

// ── Reminders ────────────────────────────────────────────────────────
export async function getReminders(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  return fetchAPI<Reminder[]>(`/api/reminders${params}`);
}

export async function createReminder(data: CreateReminderInput) {
  return fetchAPI<Reminder>('/api/reminders', { method: 'POST', body: JSON.stringify(data) });
}

export async function cancelReminder(id: string) {
  return fetchAPI<{ success: boolean }>(`/api/reminders/${id}`, { method: 'DELETE' });
}

export async function deleteReminder(id: string) {
  return fetchAPI<{ success: boolean }>(`/api/reminders/${id}`, { method: 'DELETE' });
}

// ── Search ───────────────────────────────────────────────────────────
export async function search(q: string, opts: { limit?: number; offset?: number; includeRepos?: boolean } = {}) {
  const { limit = 25, offset = 0, includeRepos = false } = opts;
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
  if (includeRepos) params.set('includeRepos', 'true');
  return fetchAPI<{ results: any[]; codeResults: any[]; total: number; query: string }>(`/api/search?${params}`);
}

// ── Timeline ─────────────────────────────────────────────────────────
export async function getTimeline(projectId?: string, limit = 50, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (projectId) params.set('projectId', projectId);
  return fetchAPI<any[]>(`/api/timeline?${params}`);
}

// ── Devices ──────────────────────────────────────────────────────────
export async function getDevices() {
  return fetchAPI<any[]>('/api/devices');
}

export async function revokeDevice(id: string) {
  return fetchAPI<{ success: boolean }>(`/api/devices/${id}`, { method: 'DELETE' });
}

// ── Push ─────────────────────────────────────────────────────────────
export async function getVapidKey() {
  return fetchAPI<{ publicKey: string }>('/api/push/vapid-key');
}

export async function subscribePush(subscription: PushSubscription) {
  const sub = subscription.toJSON();
  return fetchAPI<{ success: boolean }>('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.keys,
      userAgent: navigator.userAgent,
    }),
  });
}

export async function getServerStatus() {
  return fetchAPI<{
    now: string;
    process: {
      uptimeSeconds: number;
      node: string;
      platform: string;
      pid: number;
    };
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
    os: {
      hostname: string;
      uptimeSeconds: number;
      loadAvg: number[];
    };
    database: {
      healthy: boolean;
      latencyMs: number | null;
    };
    disk: {
      path: string;
      totalMb: number;
      freeMb: number;
      usedMb: number;
      usedPct: number;
      available: boolean;
    };
  }>('/api/server/status');
}

export async function syncProjectRepo(projectId: string) {
  return fetchAPI<{ success: boolean; commit: string; localPath: string }>(
    `/api/projects/${projectId}/repo/sync`,
    { method: 'POST' },
  );
}

export async function getProjectRepoTree(projectId: string, path = '') {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  const query = params.toString();
  return fetchAPI<{ path: string; items: Array<{ type: string; name: string; path: string }> }>(
    `/api/projects/${projectId}/repo/tree${query ? `?${query}` : ''}`,
  );
}

export async function getProjectRepoFile(projectId: string, path: string) {
  const params = new URLSearchParams({ path });
  return fetchAPI<{ path: string; size: number; content: string; commitSha: string | null }>(
    `/api/projects/${projectId}/repo/file?${params}`,
  );
}

export async function searchProjectRepo(projectId: string, q: string) {
  const params = new URLSearchParams({ q });
  return fetchAPI<{ results: Array<{ path: string; line: number; preview: string }>; query: string }>(
    `/api/projects/${projectId}/repo/search?${params}`,
  );
}

// ── Note Suggestions ─────────────────────────────────────────────────
export async function listSuggestions(
  projectId: string,
  opts?: { status?: string; limit?: number },
) {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return fetchAPI<{ suggestions: any[] }>(
    `/api/projects/${projectId}/suggestions${qs ? `?${qs}` : ''}`,
  );
}

export async function acceptSuggestion(projectId: string, suggestionId: string) {
  return fetchAPI<{ note: any; suggestion: any }>(
    `/api/projects/${projectId}/suggestions/${suggestionId}/accept`,
    { method: 'POST' },
  );
}

export async function dismissSuggestion(projectId: string, suggestionId: string) {
  return fetchAPI<{ suggestion: any }>(
    `/api/projects/${projectId}/suggestions/${suggestionId}/dismiss`,
    { method: 'POST' },
  );
}

// ── Notes for files ───────────────────────────────────────────────────
export type FileNote = {
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

export type SemanticFileNote = FileNote & { similarity: number };

export async function listAnchoredNotesForFile(projectId: string, filePath: string) {
  return fetchAPI<{
    /** Legacy field — same as anchored, kept for backward compat */
    notes: FileNote[];
    anchored: FileNote[];
    semantic: SemanticFileNote[];
    filePath: string;
    projectId: string;
  }>(`/api/projects/${projectId}/files/notes?path=${encodeURIComponent(filePath)}`);
}

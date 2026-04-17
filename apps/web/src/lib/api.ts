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
  return fetchAPI<any[]>(`/api/projects${params}`);
}

export async function getProject(id: string) {
  return fetchAPI<any>(`/api/projects/${id}`);
}

export async function createProject(data: any) {
  return fetchAPI<any>('/api/projects', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateProject(id: string, data: any) {
  return fetchAPI<any>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteProject(id: string) {
  return fetchAPI<any>(`/api/projects/${id}`, { method: 'DELETE' });
}

// ── Notes ────────────────────────────────────────────────────────────
export async function getNotes(projectId: string, kind?: string) {
  const params = new URLSearchParams({ projectId });
  if (kind) params.set('kind', kind);
  return fetchAPI<any[]>(`/api/notes?${params}`);
}

export async function createNote(data: any) {
  return fetchAPI<any>('/api/notes', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateNote(id: string, data: any) {
  return fetchAPI<any>(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteNote(id: string) {
  return fetchAPI<any>(`/api/notes/${id}`, { method: 'DELETE' });
}

// ── Attachments ──────────────────────────────────────────────────────
export async function getAttachments(projectId: string) {
  return fetchAPI<any[]>(`/api/attachments?projectId=${projectId}`);
}

export async function uploadAttachment(formData: FormData) {
  const res = await fetch('/api/attachments', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteAttachment(id: string) {
  return fetchAPI<any>(`/api/attachments/${id}`, { method: 'DELETE' });
}

export function getAttachmentUrl(id: string) {
  return `/api/attachments/${id}`;
}

// ── Reminders ────────────────────────────────────────────────────────
export async function getReminders(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  return fetchAPI<any[]>(`/api/reminders${params}`);
}

export async function createReminder(data: any) {
  return fetchAPI<any>('/api/reminders', { method: 'POST', body: JSON.stringify(data) });
}

export async function cancelReminder(id: string) {
  return fetchAPI<any>(`/api/reminders/${id}`, { method: 'DELETE' });
}

// ── Search ───────────────────────────────────────────────────────────
export async function search(q: string, limit = 25, offset = 0) {
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
  return fetchAPI<{ results: any[]; total: number; query: string }>(`/api/search?${params}`);
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
  return fetchAPI<any>(`/api/devices/${id}`, { method: 'DELETE' });
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

import { z } from 'zod';

// ── Project ──────────────────────────────────────────────────────────
export const projectStatusEnum = ['active', 'paused', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof projectStatusEnum)[number];

export const priorityEnum = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof priorityEnum)[number];

export const projectIconEnum = [
  'folder',
  'rocket',
  'cpu',
  'server',
  'terminal',
  'globe',
  'lightbulb',
  'wrench',
] as const;
export type ProjectIcon = (typeof projectIconEnum)[number];

export interface Project {
  id: string;
  title: string;
  slug: string;
  icon: ProjectIcon;
  themeColor: string;
  summary: string | null;
  status: ProjectStatus;
  priority: Priority;
  repositoryUrl: string | null;
  repoLocalPath: string | null;
  repoLastSyncAt: string | null;
  repoLastSyncStatus: string | null;
  repoLastSyncError: string | null;
  repoLastCommitSha: string | null;
  repoLastIndexedCommitSha: string | null;
  repoLastIndexedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  repositoryUrl: z.string().url().optional().or(z.literal('')),
  icon: z.enum(projectIconEnum).default('folder'),
  themeColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  status: z.enum(projectStatusEnum).default('active'),
  priority: z.enum(priorityEnum).default('medium'),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

// ── Note / Todo ──────────────────────────────────────────────────────
export const noteKindEnum = ['note', 'snippet', 'todo'] as const;
export type NoteKind = (typeof noteKindEnum)[number];

export interface Note {
  id: string;
  projectId: string;
  kind: NoteKind;
  title: string;
  body: string | null;
  sourceType: string | null;
  sourcePath: string | null;
  sourceLineStart: number | null;
  sourceLineEnd: number | null;
  sourceCommitSha: string | null;
  priority: Priority;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createNoteSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(noteKindEnum).default('note'),
  title: z.string().min(1).max(300),
  body: z.string().max(50000).optional(),
  sourceType: z.enum(['repo_line', 'repo_file']).optional(),
  sourcePath: z.string().max(4000).optional(),
  sourceLineStart: z.number().int().min(1).optional(),
  sourceLineEnd: z.number().int().min(1).optional(),
  sourceCommitSha: z.string().max(64).optional(),
  priority: z.enum(priorityEnum).default('medium'),
});
export type CreateNoteInput = z.input<typeof createNoteSchema>;

export const updateNoteSchema = createNoteSchema
  .partial()
  .omit({ projectId: true })
  .extend({
    completedAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  });
export type UpdateNoteInput = z.input<typeof updateNoteSchema>;

// ── Attachment ───────────────────────────────────────────────────────
export const allowedImageMimes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;
export const allowedDocMimes = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/zip',
] as const;
export const allowedMimes = [...allowedImageMimes, ...allowedDocMimes] as const;
export const maxFileSizeBytes = 50 * 1024 * 1024; // 50 MB

export interface Attachment {
  id: string;
  projectId: string;
  noteId: string | null;
  type: 'image' | 'document';
  originalName: string;
  mimeType: string;
  storagePath: string;
  fileSize: number | null;
  caption: string | null;
  createdAt: string;
}

export const attachmentMetaSchema = z.object({
  projectId: z.string().uuid(),
  noteId: z.string().uuid().optional(),
  caption: z.string().max(500).optional(),
});
export type AttachmentMetaInput = z.infer<typeof attachmentMetaSchema>;

// ── Reminder ─────────────────────────────────────────────────────────
export const reminderPresetEnum = [
  'morning',
  'afternoon',
  'in_1_day',
  'in_3_days',
  'in_7_days',
  'custom',
] as const;
export type ReminderPreset = (typeof reminderPresetEnum)[number];

export const reminderStatusEnum = ['pending', 'delivered', 'failed', 'cancelled'] as const;
export type ReminderStatus = (typeof reminderStatusEnum)[number];

export interface Reminder {
  id: string;
  projectId: string;
  noteId: string | null;
  scheduledFor: string;
  presetSource: ReminderPreset;
  status: ReminderStatus;
  deliveredAt: string | null;
  notificationPayload: any;
  createdAt: string;
}

export const createReminderSchema = z.object({
  projectId: z.string().uuid(),
  noteId: z.string().uuid().optional(),
  preset: z.enum(reminderPresetEnum),
  scheduledFor: z.string().datetime().optional(), // required for 'custom'
  title: z.string().min(1).max(300),
  body: z.string().max(1000).optional(),
});
export type CreateReminderInput = z.input<typeof createReminderSchema>;

// ── Activity Events ──────────────────────────────────────────────────
export const actorEnum = ['system', 'trusted_device'] as const;
export type Actor = (typeof actorEnum)[number];

export const eventTypeEnum = [
  'project_created',
  'project_updated',
  'project_deleted',
  'note_created',
  'note_updated',
  'note_deleted',
  'todo_completed',
  'todo_uncompleted',
  'attachment_added',
  'attachment_removed',
  'reminder_created',
  'reminder_delivered',
  'device_paired',
  'device_revoked',
] as const;
export type EventType = (typeof eventTypeEnum)[number];

export const entityTypeEnum = [
  'project',
  'note',
  'attachment',
  'reminder',
  'device',
] as const;
export type EntityType = (typeof entityTypeEnum)[number];

export interface ActivityEvent {
  id: string;
  projectId: string;
  actor: Actor;
  eventType: EventType;
  entityType: EntityType;
  entityId: string | null;
  payload: any;
  occurredAt: string;
}

// ── Search ───────────────────────────────────────────────────────────
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// ── Pairing ──────────────────────────────────────────────────────────
export const redeemTokenSchema = z.object({
  token: z.string().min(1).max(128),
  deviceLabel: z.string().min(1).max(100).default('My Device'),
});
export type RedeemTokenInput = z.infer<typeof redeemTokenSchema>;

// ── Push Subscription ────────────────────────────────────────────────
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

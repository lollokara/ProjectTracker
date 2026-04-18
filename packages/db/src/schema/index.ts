import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
  jsonb,
  integer,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom vector type for pgvector
const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(384)';
  },
});

// ── Enums ────────────────────────────────────────────────────────────
export const projectStatusEnum = pgEnum('project_status', [
  'active',
  'paused',
  'completed',
  'archived',
]);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'critical']);
export const noteKindEnum = pgEnum('note_kind', ['note', 'snippet', 'todo']);
export const reminderStatusEnum = pgEnum('reminder_status', [
  'pending',
  'delivered',
  'failed',
  'cancelled',
]);
export const reminderPresetEnum = pgEnum('reminder_preset', [
  'morning',
  'afternoon',
  'in_1_day',
  'in_3_days',
  'in_7_days',
  'custom',
]);
export const actorEnum = pgEnum('actor', ['system', 'trusted_device']);

// ── Projects ─────────────────────────────────────────────────────────
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 220 }).notNull().unique(),
    icon: varchar('icon', { length: 50 }).notNull().default('folder'),
    themeColor: varchar('theme_color', { length: 20 }).notNull().default('#00F5FF'),
    summary: text('summary'),
    status: projectStatusEnum('status').notNull().default('active'),
    priority: priorityEnum('priority').notNull().default('medium'),
    repositoryUrl: text('repository_url'),
    repoLocalPath: text('repo_local_path'),
    repoLastSyncAt: timestamp('repo_last_sync_at', { withTimezone: true }),
    repoLastSyncStatus: varchar('repo_last_sync_status', { length: 30 }),
    repoLastSyncError: text('repo_last_sync_error'),
    repoLastCommitSha: varchar('repo_last_commit_sha', { length: 64 }),
    repoLastIndexedCommitSha: varchar('repo_last_indexed_commit_sha', { length: 64 }),
    repoLastIndexedAt: timestamp('repo_last_indexed_at', { withTimezone: true }),
    searchVector: text('search_vector'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('projects_status_idx').on(t.status),
    index('projects_created_at_idx').on(t.createdAt),
  ],
);

// ── Notes (notes, snippets, todos) ───────────────────────────────────
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: noteKindEnum('kind').notNull().default('note'),
    title: varchar('title', { length: 300 }).notNull(),
    body: text('body'),
    sourceType: varchar('source_type', { length: 30 }),
    sourcePath: text('source_path'),
    sourceLineStart: integer('source_line_start'),
    sourceLineEnd: integer('source_line_end'),
    sourceCommitSha: varchar('source_commit_sha', { length: 64 }),
    priority: priorityEnum('priority').notNull().default('medium'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    searchVector: text('search_vector'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notes_project_id_idx').on(t.projectId),
    index('notes_kind_idx').on(t.kind),
  ],
);

// ── Attachments ──────────────────────────────────────────────────────
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id').references(() => notes.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 20 }).notNull(), // 'image' | 'document'
    originalName: varchar('original_name', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    storagePath: text('storage_path').notNull(),
    fileSize: integer('file_size'),
    caption: text('caption'),
    searchVector: text('search_vector'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('attachments_project_id_idx').on(t.projectId),
    index('attachments_note_id_idx').on(t.noteId),
  ],
);

// ── Reminders ────────────────────────────────────────────────────────
export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id').references(() => notes.id, { onDelete: 'set null' }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    presetSource: reminderPresetEnum('preset_source').notNull(),
    status: reminderStatusEnum('status').notNull().default('pending'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    notificationPayload: jsonb('notification_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reminders_status_scheduled_idx').on(t.status, t.scheduledFor),
    index('reminders_project_id_idx').on(t.projectId),
  ],
);

// ── Activity Events ──────────────────────────────────────────────────
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    actor: actorEnum('actor').notNull().default('trusted_device'),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: uuid('entity_id'),
    payload: jsonb('payload'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_events_project_id_idx').on(t.projectId),
    index('activity_events_occurred_at_idx').on(t.occurredAt),
    index('activity_events_event_type_idx').on(t.eventType),
  ],
);

// ── Trusted Devices ──────────────────────────────────────────────────
export const trustedDevices = pgTable('trusted_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: varchar('label', { length: 100 }).notNull(),
  tokenHash: varchar('token_hash', { length: 128 }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// ── Pairing Tokens ───────────────────────────────────────────────────
export const pairingTokens = pgTable(
  'pairing_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdByDeviceId: uuid('created_by_device_id').references(() => trustedDevices.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pairing_tokens_hash_idx').on(t.tokenHash)],
);

// ── Push Subscriptions ───────────────────────────────────────────────
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => trustedDevices.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('push_subscriptions_device_id_idx').on(t.deviceId)],
);

// ── Code Embeddings (Semantic Search) ────────────────────────────────
export const codeEmbeddings = pgTable(
  'code_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    lineNumber: integer('line_number').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('code_embeddings_project_id_idx').on(t.projectId)],
);

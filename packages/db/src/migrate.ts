import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index.js';

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL NOT FOUND');
    process.exit(1);
  }

  console.log('[migrate] Connecting to database...');
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log('[migrate] Creating tables...');

  // Enable vector extension
  await client.unsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Create enums
  await client.unsafe(`
    DO $$ BEGIN
      CREATE TYPE project_status AS ENUM ('active', 'paused', 'completed', 'archived');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'critical');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE note_kind AS ENUM ('note', 'snippet', 'todo');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE reminder_status AS ENUM ('pending', 'delivered', 'failed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE reminder_preset AS ENUM ('morning', 'afternoon', 'in_1_day', 'in_3_days', 'in_7_days', 'custom');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE actor AS ENUM ('system', 'trusted_device');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // Create tables & indexes
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      label VARCHAR(100) NOT NULL,
      token_hash VARCHAR(128),
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS pairing_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_by_device_id UUID REFERENCES trusted_devices(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS pairing_tokens_hash_idx ON pairing_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id UUID NOT NULL REFERENCES trusted_devices(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_device_id_idx ON push_subscriptions(device_id);

    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(220) NOT NULL UNIQUE,
      summary TEXT,
      status project_status NOT NULL DEFAULT 'active',
      priority priority NOT NULL DEFAULT 'medium',
      search_vector TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
    CREATE INDEX IF NOT EXISTS projects_created_at_idx ON projects(created_at);

    ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon VARCHAR(50) NOT NULL DEFAULT 'folder';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_color VARCHAR(20) NOT NULL DEFAULT '#00F5FF';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repository_url TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_local_path TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_last_sync_at TIMESTAMPTZ;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_last_sync_status VARCHAR(30);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_last_sync_error TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_last_commit_sha VARCHAR(64);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_last_indexed_commit_sha VARCHAR(64);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_last_indexed_at TIMESTAMPTZ;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_indexing_progress INTEGER;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_indexing_total INTEGER;

    WITH palette AS (
      SELECT ARRAY[
        '#00F5FF',
        '#39FF14',
        '#FF3AF2',
        '#FF8A00',
        '#8B5CF6',
        '#FF2D55',
        '#00FFC2',
        '#FFD60A'
      ]::TEXT[] AS colors
    ),
    ordered_projects AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
      FROM projects
      WHERE theme_color IS NULL OR theme_color = '#00F5FF'
    )
    UPDATE projects p
    SET theme_color = (
      SELECT colors[((op.rn - 1) % array_length(colors, 1)) + 1]
      FROM palette, ordered_projects op
      WHERE op.id = p.id
    )
    WHERE p.id IN (SELECT id FROM ordered_projects);

    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind note_kind NOT NULL DEFAULT 'note',
      title VARCHAR(300) NOT NULL,
      body TEXT,
      source_type VARCHAR(30),
      source_path TEXT,
      source_line_start INTEGER,
      source_line_end INTEGER,
      source_commit_sha VARCHAR(64),
      priority priority NOT NULL DEFAULT 'medium',
      completed_at TIMESTAMPTZ,
      search_vector TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS notes_project_id_idx ON notes(project_id);
    CREATE INDEX IF NOT EXISTS notes_kind_idx ON notes(kind);

    CREATE TABLE IF NOT EXISTS attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
      type VARCHAR(20) NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      storage_path TEXT NOT NULL,
      file_size INTEGER,
      caption TEXT,
      search_vector TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS attachments_project_id_idx ON attachments(project_id);
    CREATE INDEX IF NOT EXISTS attachments_note_id_idx ON attachments(note_id);

    CREATE TABLE IF NOT EXISTS reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
      scheduled_for TIMESTAMPTZ NOT NULL,
      preset_source reminder_preset NOT NULL,
      status reminder_status NOT NULL DEFAULT 'pending',
      delivered_at TIMESTAMPTZ,
      notification_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS reminders_status_scheduled_idx ON reminders(status, scheduled_for);
    CREATE INDEX IF NOT EXISTS reminders_project_id_idx ON reminders(project_id);

    CREATE TABLE IF NOT EXISTS activity_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      actor actor NOT NULL DEFAULT 'trusted_device',
      event_type VARCHAR(50) NOT NULL,
      entity_type VARCHAR(30) NOT NULL,
      entity_id UUID,
      payload JSONB,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS activity_events_project_id_idx ON activity_events(project_id);
    CREATE INDEX IF NOT EXISTS activity_events_occurred_at_idx ON activity_events(occurred_at);
    CREATE INDEX IF NOT EXISTS activity_events_event_type_idx ON activity_events(event_type);

    CREATE TABLE IF NOT EXISTS code_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding VECTOR(384) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS code_embeddings_project_id_idx ON code_embeddings(project_id);
  `);

  // pg_trgm extension + code_files table + indexes
  await client.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS code_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path text NOT NULL,
      file_name text NOT NULL,
      extension varchar(20),
      language varchar(30),
      size_bytes integer NOT NULL,
      line_count integer NOT NULL,
      title_snippet text,
      last_commit_at timestamptz,
      last_commit_sha varchar(64),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS code_files_project_id_idx ON code_files(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS code_files_project_path_idx ON code_files(project_id, file_path);
    CREATE INDEX IF NOT EXISTS code_files_file_name_trgm_idx ON code_files USING gin (file_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS code_files_file_path_trgm_idx ON code_files USING gin (file_path gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS code_files_title_trgm_idx ON code_files USING gin (title_snippet gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS code_files_last_commit_at_idx ON code_files(last_commit_at DESC);

    CREATE INDEX IF NOT EXISTS code_embeddings_vec_idx
      ON code_embeddings USING hnsw (embedding vector_cosine_ops);
  `);

  // notes embedding column + HNSW index (phase 2 semantic linking prep)
  await client.unsafe(`
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS embedding vector(384);
    CREATE INDEX IF NOT EXISTS notes_embedding_vec_idx ON notes USING hnsw (embedding vector_cosine_ops);
  `);

  // note_suggestions table (TODO/FIXME scraping)
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS note_suggestions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path text NOT NULL,
      line_number integer NOT NULL,
      keyword varchar(20) NOT NULL,
      text text NOT NULL,
      source_commit_sha varchar(64),
      status varchar(20) NOT NULL DEFAULT 'pending',
      accepted_note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS note_suggestions_project_status_idx ON note_suggestions(project_id, status);
    CREATE INDEX IF NOT EXISTS note_suggestions_project_path_idx ON note_suggestions(project_id, file_path);
    CREATE UNIQUE INDEX IF NOT EXISTS note_suggestions_dedup_idx ON note_suggestions(project_id, file_path, line_number, keyword, md5(text));
  `);

  console.log('[migrate] All tables created successfully');
  await client.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});

import { NextRequest, NextResponse } from 'next/server';
import { db, notes, activityEvents, reminders, projects } from '@tracker/db';
import { eq, desc, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { createNoteSchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';
import { embedNote } from '@/lib/notes-embeddings';
import { enrichNote } from '@/lib/note-enrichment';

const NEAR_DUPLICATE_THRESHOLD = 0.85;

// GET /api/notes?projectId=xxx — list notes for a project
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const kind = searchParams.get('kind');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    let conditions = [eq(notes.projectId, projectId)];
    if (kind) {
      conditions.push(eq(notes.kind, kind as any));
    }

    const result = await db
      .select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.createdAt));

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/notes — create a note/todo
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const { force = false, ...rest } = body;
    const validated = createNoteSchema.parse(rest);

    // ── Tier-0 rules-based enrichment ────────────────────────────────
    // Check if the project has auto_enrich enabled
    const [projectRow] = await db
      .select({ autoEnrich: projects.autoEnrich })
      .from(projects)
      .where(eq(projects.id, validated.projectId))
      .limit(1);

    const enrichment = enrichNote({ title: validated.title, body: validated.body });

    // Track what was actually applied for the response
    let priorityApplied = false;
    let sourcePathApplied = false;

    const shouldEnrich = projectRow?.autoEnrich !== false;

    if (shouldEnrich) {
      // Priority: only fill if user left it at the schema default (undefined in input)
      // createNoteSchema applies default('medium') so we check the raw input
      if (rest.priority === undefined && enrichment.priority !== null) {
        validated.priority = enrichment.priority;
        priorityApplied = true;
      }

      // Source path: fill if user didn't provide one
      if (!rest.sourcePath && !rest.sourceType && enrichment.suggestedSourcePath !== null) {
        validated.sourcePath = enrichment.suggestedSourcePath;
        validated.sourceType = 'repo_file';
        sourcePathApplied = true;
      }

      // Tags & mentions: append trailing line to body if any found
      if (enrichment.tags.length > 0 || enrichment.mentions.length > 0) {
        const tagsPart = enrichment.tags.length > 0
          ? `Tags: ${enrichment.tags.map((t) => `#${t}`).join(' ')}`
          : '';
        const mentionsPart = enrichment.mentions.length > 0
          ? `Mentions: ${enrichment.mentions.map((m) => `@${m}`).join(' ')}`
          : '';
        const trailingLine = [tagsPart, mentionsPart].filter(Boolean).join(' · ');
        const currentBody = validated.body ?? '';
        if (!currentBody.includes(trailingLine)) {
          validated.body = currentBody ? `${currentBody}\n\n${trailingLine}` : trailingLine;
        }
      }
    }

    // Compute embedding (non-fatal if model fails)
    let vec: number[] | null = null;
    try {
      vec = await embedNote({ title: validated.title, body: validated.body });
    } catch (embErr) {
      console.error('[notes] embedNote failed, proceeding without embedding:', embErr);
    }

    // Near-duplicate check (only when we have a vector and force is false)
    if (vec !== null && !force) {
      const vecStr = `[${vec.join(',')}]`;
      const dupRows = await db.execute(sql`
        SELECT id, title,
               LEFT(COALESCE(body, ''), 160) AS snippet,
               kind, priority, created_at,
               1 - (embedding <=> ${vecStr}::vector) AS sim
        FROM notes
        WHERE project_id = ${validated.projectId}
          AND embedding IS NOT NULL
          AND (1 - (embedding <=> ${vecStr}::vector)) > ${NEAR_DUPLICATE_THRESHOLD}
        ORDER BY embedding <=> ${vecStr}::vector
        LIMIT 3
      `);

      const nearDuplicates = (dupRows as any[]).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        snippet: (r.snippet as string) ?? '',
        kind: r.kind as string,
        priority: r.priority as string,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        similarity: parseFloat(r.sim as string) || 0,
      }));

      if (nearDuplicates.length > 0) {
        return NextResponse.json({ created: false, nearDuplicates }, { status: 200 });
      }
    }

    const [note] = await db
      .insert(notes)
      .values({
        ...validated,
        searchVector: [validated.title, validated.body || ''].join(' '),
        embedding: vec ?? undefined,
      })
      .returning();

    // Insert reminder if enrichment found a future date and user didn't supply one
    if (shouldEnrich && enrichment.reminderAt !== null && !rest.reminderAt) {
      try {
        await db.insert(reminders).values({
          projectId: note.projectId,
          noteId: note.id,
          scheduledFor: enrichment.reminderAt,
          presetSource: 'custom',
          status: 'pending',
        });
      } catch (reminderErr) {
        console.error('[notes] reminder insert failed (non-fatal):', reminderErr);
      }
    }

    const eventType = validated.kind === 'todo' ? 'note_created' : 'note_created';
    await db.insert(activityEvents).values({
      projectId: validated.projectId,
      actor: 'trusted_device',
      eventType,
      entityType: 'note',
      entityId: note.id,
      payload: { title: note.title, kind: note.kind },
    });

    return NextResponse.json(
      {
        created: true,
        note,
        enrichment: {
          reminderAt: enrichment.reminderAt?.toISOString() ?? null,
          priorityApplied,
          sourcePathApplied,
          tags: enrichment.tags,
          mentions: enrichment.mentions,
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db, notes, activityEvents } from '@tracker/db';
import { eq, desc, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { createNoteSchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';
import { embedNote } from '@/lib/notes-embeddings';

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

    const eventType = validated.kind === 'todo' ? 'note_created' : 'note_created';
    await db.insert(activityEvents).values({
      projectId: validated.projectId,
      actor: 'trusted_device',
      eventType,
      entityType: 'note',
      entityId: note.id,
      payload: { title: note.title, kind: note.kind },
    });

    return NextResponse.json({ created: true, note }, { status: 201 });
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

import { NextRequest, NextResponse } from 'next/server';
import { db, notes, activityEvents } from '@tracker/db';
import { eq, desc, and } from 'drizzle-orm';
import { createNoteSchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';

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
    const validated = createNoteSchema.parse(body);

    const [note] = await db
      .insert(notes)
      .values({
        ...validated,
        searchVector: [validated.title, validated.body || ''].join(' '),
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

    return NextResponse.json(note, { status: 201 });
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

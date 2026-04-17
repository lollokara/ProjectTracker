import { NextRequest, NextResponse } from 'next/server';
import { db, notes, activityEvents } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { updateNoteSchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/notes/[id]
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;
    const [note] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(note);
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/notes/[id]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateNoteSchema.parse(body);

    // Detect todo completion toggle
    const [existing] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: any = {
      ...validated,
      updatedAt: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(validated, 'completedAt')) {
      updates.completedAt = validated.completedAt ? new Date(validated.completedAt) : null;
    }

    if (validated.title || validated.body) {
      updates.searchVector = [validated.title || existing.title, validated.body || existing.body || ''].join(' ');
    }

    const [note] = await db.update(notes).set(updates).where(eq(notes.id, id)).returning();

    // Detect completion
    let eventType = 'note_updated';
    if (body.completedAt && !existing.completedAt) {
      eventType = 'todo_completed';
    } else if (body.completedAt === null && existing.completedAt) {
      eventType = 'todo_uncompleted';
    }

    await db.insert(activityEvents).values({
      projectId: note.projectId,
      actor: 'trusted_device',
      eventType,
      entityType: 'note',
      entityId: note.id,
      payload: { title: note.title, kind: note.kind },
    });

    return NextResponse.json(note);
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    console.error('[notes] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/notes/[id]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;
    const [note] = await db.delete(notes).where(eq(notes.id, id)).returning();
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.insert(activityEvents).values({
      projectId: note.projectId,
      actor: 'trusted_device',
      eventType: 'note_deleted',
      entityType: 'note',
      entityId: note.id,
      payload: { title: note.title },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db, projects, activityEvents } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { updateProjectSchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/projects/[id]
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;
    const body = await request.json();
    const validated = updateProjectSchema.parse(body);

    const [project] = await db
      .update(projects)
      .set({
        ...validated,
        searchVector: [validated.title, validated.summary].filter(Boolean).join(' ') || undefined,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await db.insert(activityEvents).values({
      projectId: project.id,
      actor: 'trusted_device',
      eventType: 'project_updated',
      entityType: 'project',
      entityId: project.id,
      payload: { changes: Object.keys(validated) },
    });

    return NextResponse.json(project);
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

// DELETE /api/projects/[id]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [project] = await db.delete(projects).where(eq(projects.id, id)).returning();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Note: cascade will delete notes, attachments, reminders, events

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

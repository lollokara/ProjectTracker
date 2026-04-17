import { NextRequest, NextResponse } from 'next/server';
import { db, activityEvents, projects } from '@tracker/db';
import { eq, desc, and, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

// GET /api/timeline?projectId=xxx&limit=50&offset=0
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query;
    if (projectId) {
      query = db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.projectId, projectId))
        .orderBy(desc(activityEvents.occurredAt))
        .limit(limit)
        .offset(offset);
    } else {
      // Global timeline — join with project name
      query = db
        .select({
          id: activityEvents.id,
          projectId: activityEvents.projectId,
          projectTitle: projects.title,
          actor: activityEvents.actor,
          eventType: activityEvents.eventType,
          entityType: activityEvents.entityType,
          entityId: activityEvents.entityId,
          payload: activityEvents.payload,
          occurredAt: activityEvents.occurredAt,
        })
        .from(activityEvents)
        .leftJoin(projects, eq(activityEvents.projectId, projects.id))
        .orderBy(desc(activityEvents.occurredAt))
        .limit(limit)
        .offset(offset);
    }

    const events = await query;
    return NextResponse.json(events);
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

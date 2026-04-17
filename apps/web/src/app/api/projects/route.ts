import { NextRequest, NextResponse } from 'next/server';
import { db, projects, activityEvents } from '@tracker/db';
import { eq, desc, sql, ilike, or } from 'drizzle-orm';
import { createProjectSchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 200);
}

// GET /api/projects — list all projects
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = db.select().from(projects).orderBy(desc(projects.updatedAt));

    if (status) {
      query = query.where(eq(projects.status, status as any)) as any;
    }

    const result = await query;
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects — create a project
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const validated = createProjectSchema.parse(body);

    const slug = slugify(validated.title) + '-' + Date.now().toString(36);

    const [project] = await db
      .insert(projects)
      .values({
        ...validated,
        slug,
        searchVector: [validated.title, validated.summary || ''].join(' '),
      })
      .returning();

    // Activity event
    await db.insert(activityEvents).values({
      projectId: project.id,
      actor: 'trusted_device',
      eventType: 'project_created',
      entityType: 'project',
      entityId: project.id,
      payload: { title: project.title },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('[projects] Create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

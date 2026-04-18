import { NextRequest, NextResponse } from 'next/server';
import { db, projects } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { listTree } from '@/lib/repo';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [project] = await db
      .select({ id: projects.id, repoLastSyncStatus: projects.repoLastSyncStatus })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.repoLastSyncStatus !== 'ok') {
      return NextResponse.json({ error: 'Repository is not synced yet' }, { status: 400 });
    }

    const path = request.nextUrl.searchParams.get('path') || '';
    const items = await listTree(id, path);

    return NextResponse.json({ path, items });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error.message === 'Invalid path') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

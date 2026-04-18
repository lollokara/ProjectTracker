import { NextRequest, NextResponse } from 'next/server';
import { db, projects } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { readRepoFile } from '@/lib/repo';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [project] = await db
      .select({ id: projects.id, repoLastSyncStatus: projects.repoLastSyncStatus, repoLastCommitSha: projects.repoLastCommitSha })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.repoLastSyncStatus !== 'ok') {
      return NextResponse.json({ error: 'Repository is not synced yet' }, { status: 400 });
    }

    const relativePath = request.nextUrl.searchParams.get('path') || '';
    const file = await readRepoFile(id, relativePath);

    return NextResponse.json({ ...file, commitSha: project.repoLastCommitSha });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (['Invalid path', 'path is required', 'File too large to preview'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

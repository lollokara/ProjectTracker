import { NextRequest, NextResponse } from 'next/server';
import { db, projects } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { hybridRepoSearch } from '@/lib/search';

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

    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ results: [], query: '' });
    }

    const matches = await hybridRepoSearch({ query: q, projectId: id, limit: 50 });

    const results = matches.map((match) => ({
      path: match.filePath,
      line: match.lineNumber ?? 1,
      preview: match.preview ?? match.fileName,
    }));

    return NextResponse.json({ results, query: q });
  } catch (error: any) {
    console.error('[repo/search] Error:', error);
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error', detail: error.message }, { status: 500 });
  }
}

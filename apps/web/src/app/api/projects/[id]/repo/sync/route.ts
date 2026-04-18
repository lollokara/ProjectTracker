import { NextResponse } from 'next/server';
import { db, projects } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { syncRepo } from '@/lib/repo';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [project] = await db
      .select({ id: projects.id, repositoryUrl: projects.repositoryUrl })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.repositoryUrl) {
      return NextResponse.json({ error: 'Project has no repository URL' }, { status: 400 });
    }

    const updateStatus = async (status: string) => {
      await db
        .update(projects)
        .set({
          repoLastSyncStatus: status,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
    };

    await updateStatus('syncing');

    try {
      const synced = await syncRepo(id, project.repositoryUrl, updateStatus);
      await db
        .update(projects)
        .set({
          repoLocalPath: synced.dir,
          repoLastSyncStatus: 'ok',
          repoLastSyncAt: new Date(),
          repoLastCommitSha: synced.commit,
          repoLastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));

      return NextResponse.json({
        success: true,
        commit: synced.commit,
        localPath: synced.dir,
      });
    } catch (syncError: any) {
      await db
        .update(projects)
        .set({
          repoLastSyncStatus: 'failed',
          repoLastSyncError: syncError.message?.slice(0, 1000) || 'sync failed',
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));

      return NextResponse.json({ error: 'Repository sync failed', detail: syncError.message }, { status: 500 });
    }
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

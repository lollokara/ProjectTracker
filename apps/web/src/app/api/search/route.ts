import { NextRequest, NextResponse } from 'next/server';
import { db, projects, notes, attachments } from '@tracker/db';
import { sql, ilike, or } from 'drizzle-orm';
import { searchQuerySchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';
import { hybridRepoSearch } from '@/lib/search';

// GET /api/search?q=keyword&limit=25&offset=0&includeRepos=true
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const params = searchQuerySchema.parse(Object.fromEntries(searchParams));
    const { q, limit, offset } = params;
    // includeRepos accepted for back-compat but always computed now
    // const includeRepos = searchParams.get('includeRepos') === 'true';

    const escapedQ = q.replace(/[%_\\]/g, '\\$&');
    const searchPattern = `%${escapedQ}%`;

    // Search across projects
    const projectResults = await db
      .select({
        id: projects.id,
        type: sql<string>`'project'`,
        title: projects.title,
        summary: projects.summary,
        projectId: projects.id,
        projectTitle: projects.title,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(
        or(
          ilike(projects.title, searchPattern),
          ilike(projects.summary, searchPattern),
          ilike(projects.searchVector, searchPattern),
        ),
      )
      .limit(limit);

    // Search across notes
    const noteResults = await db
      .select({
        id: notes.id,
        type: sql<string>`'note'`,
        title: notes.title,
        summary: notes.body,
        projectId: notes.projectId,
        projectTitle: sql<string>`''`,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .where(
        or(
          ilike(notes.title, searchPattern),
          ilike(notes.body, searchPattern),
          ilike(notes.searchVector, searchPattern),
        ),
      )
      .limit(limit);

    // Search across attachments
    const attachmentResults = await db
      .select({
        id: attachments.id,
        type: sql<string>`'attachment'`,
        title: attachments.originalName,
        summary: attachments.caption,
        projectId: attachments.projectId,
        projectTitle: sql<string>`''`,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        or(
          ilike(attachments.originalName, searchPattern),
          ilike(attachments.caption, searchPattern),
          ilike(attachments.searchVector, searchPattern),
        ),
      )
      .limit(limit);

    // Merge and sort text results
    const allResults = [...projectResults, ...noteResults, ...attachmentResults]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);

    // Hybrid repo search — always included
    const codeResults = await hybridRepoSearch({ query: q, limit });

    return NextResponse.json({
      results: allResults,
      codeResults,
      total: projectResults.length + noteResults.length + attachmentResults.length,
      query: q,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid query', details: error.errors }, { status: 400 });
    console.error('[search] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

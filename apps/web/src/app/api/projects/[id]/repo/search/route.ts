import { NextRequest, NextResponse } from 'next/server';
import { db, projects, codeEmbeddings } from '@tracker/db';
import { eq, sql, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { searchRepo } from '@/lib/repo';
import { generateQueryEmbedding } from '@/lib/embeddings';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;
    const mode = request.nextUrl.searchParams.get('mode') || 'exact';

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

    let results: any[] = [];

    if (mode === 'semantic') {
      const embedding = await generateQueryEmbedding(q);
      const similarityThreshold = 0.3; // Minimum cosine similarity
      const vectorStr = `[${embedding.join(',')}]`;

      // Drizzle doesn't have native vector similarity helper yet, so use raw SQL
      const semanticResults = await db.execute(sql`
        SELECT 
          file_path, 
          line_number, 
          content,
          1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM code_embeddings
        WHERE project_id = ${id}
        AND 1 - (embedding <=> ${vectorStr}::vector) > ${similarityThreshold}
        ORDER BY similarity DESC
        LIMIT 20
      `);

      results = semanticResults.map((r: any) => ({
        path: r.file_path,
        line: r.line_number,
        preview: r.content.split('\n').slice(2).join('\n'), // Skip the "File: ..." header
        similarity: r.similarity
      }));
    } else {
      results = await searchRepo(id, q);
    }

    return NextResponse.json({ results, query: q, mode });
  } catch (error: any) {
    console.error('[search] Error:', error);
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error', detail: error.message }, { status: 500 });
  }
}

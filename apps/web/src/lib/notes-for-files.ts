import { db, notes, codeEmbeddings } from '@tracker/db';
import { and, eq, inArray, notInArray, or, sql, isNotNull, asc } from 'drizzle-orm';

/**
 * Batch: count anchored notes for a list of (projectId, filePath) pairs.
 * Returns a Map keyed by `${projectId}::${filePath}` → count.
 */
export async function countAnchoredNotes(
  pairs: Array<{ projectId: string; filePath: string }>
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (pairs.length === 0) return result;

  // Cap at 50 pairs per query
  const chunks: Array<typeof pairs> = [];
  for (let i = 0; i < pairs.length; i += 50) {
    chunks.push(pairs.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const pairConditions = chunk.map((p) =>
      and(eq(notes.projectId, p.projectId), eq(notes.sourcePath, p.filePath))
    );

    const rows = await db
      .select({
        projectId: notes.projectId,
        sourcePath: notes.sourcePath,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(notes)
      .where(
        and(
          inArray(notes.sourceType, ['repo_file', 'repo_line']),
          or(...pairConditions)
        )
      )
      .groupBy(notes.projectId, notes.sourcePath);

    for (const row of rows) {
      if (row.projectId && row.sourcePath) {
        result.set(`${row.projectId}::${row.sourcePath}`, row.count);
      }
    }
  }

  return result;
}

export type AnchoredNote = {
  id: string;
  title: string;
  kind: 'note' | 'snippet' | 'todo';
  priority: 'low' | 'medium' | 'high' | 'critical';
  completedAt: string | null;
  sourceLineStart: number | null;
  sourceLineEnd: number | null;
  createdAt: string;
  snippet: string | null;
};

/**
 * List anchored notes for one file, newest first.
 */
export async function listAnchoredNotes(opts: {
  projectId: string;
  filePath: string;
  limit?: number;
}): Promise<AnchoredNote[]> {
  const { projectId, filePath, limit = 20 } = opts;

  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      kind: notes.kind,
      priority: notes.priority,
      completedAt: notes.completedAt,
      sourceLineStart: notes.sourceLineStart,
      sourceLineEnd: notes.sourceLineEnd,
      createdAt: notes.createdAt,
      body: notes.body,
    })
    .from(notes)
    .where(
      and(
        eq(notes.projectId, projectId),
        eq(notes.sourcePath, filePath),
        inArray(notes.sourceType, ['repo_file', 'repo_line'])
      )
    )
    .orderBy(sql`${notes.createdAt} DESC`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    priority: r.priority,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    sourceLineStart: r.sourceLineStart,
    sourceLineEnd: r.sourceLineEnd,
    createdAt: r.createdAt.toISOString(),
    snippet: r.body ? r.body.trim().slice(0, 160) || null : null,
  }));
}

export type SemanticNote = AnchoredNote & { similarity: number };

/**
 * kNN semantic related notes for a file.
 * Uses the first code_embeddings row for the file as the query vector.
 * Returns [] if no embedding exists for the file yet.
 */
export async function listSemanticRelatedNotes(opts: {
  projectId: string;
  filePath: string;
  excludeIds: string[];
  limit?: number;
}): Promise<SemanticNote[]> {
  const { projectId, filePath, excludeIds, limit = 5 } = opts;

  // Get canonical file embedding: first code_embeddings row for this file, ordered by line_number ASC
  const anchorRows = await db
    .select({ embedding: codeEmbeddings.embedding })
    .from(codeEmbeddings)
    .where(
      and(
        eq(codeEmbeddings.projectId, projectId),
        eq(codeEmbeddings.filePath, filePath),
        isNotNull(codeEmbeddings.embedding),
      ),
    )
    .orderBy(asc(codeEmbeddings.lineNumber))
    .limit(1);

  if (anchorRows.length === 0 || !anchorRows[0].embedding) return [];

  const queryVec = anchorRows[0].embedding;
  const vecStr = `[${queryVec.join(',')}]`;

  // Build exclusion condition — notInArray requires a non-empty array
  const excludeCondition =
    excludeIds.length > 0
      ? sql`${notes.id} NOT IN (${sql.join(excludeIds.map((id) => sql`${id}::uuid`), sql`, `)})`
      : sql`TRUE`;

  const rows = await db.execute(sql`
    SELECT
      id,
      title,
      kind,
      priority,
      completed_at,
      source_line_start,
      source_line_end,
      created_at,
      body,
      1 - (embedding <=> ${vecStr}::vector) AS similarity
    FROM notes
    WHERE project_id = ${projectId}::uuid
      AND embedding IS NOT NULL
      AND ${excludeCondition}
      AND (1 - (embedding <=> ${vecStr}::vector)) > 0.3
    ORDER BY embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `);

  return (rows as any[]).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    kind: r.kind as 'note' | 'snippet' | 'todo',
    priority: r.priority as 'low' | 'medium' | 'high' | 'critical',
    completedAt: r.completed_at ? (r.completed_at instanceof Date ? r.completed_at.toISOString() : String(r.completed_at)) : null,
    sourceLineStart: r.source_line_start != null ? Number(r.source_line_start) : null,
    sourceLineEnd: r.source_line_end != null ? Number(r.source_line_end) : null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    snippet: r.body ? String(r.body).trim().slice(0, 160) || null : null,
    similarity: parseFloat(r.similarity as string) || 0,
  }));
}

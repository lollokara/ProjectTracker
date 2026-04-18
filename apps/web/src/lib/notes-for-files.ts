import { db, notes } from '@tracker/db';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

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

import { db, notes } from '@tracker/db';
import { isNull, and, or, ne, sql } from 'drizzle-orm';
import { generateEmbeddings } from './embeddings';

const BATCH = 50;

/**
 * Embeds up to BATCH notes that still have null embedding + non-empty text.
 * Safe to call on every worker tick. Returns how many were processed.
 */
export async function backfillNoteEmbeddings(): Promise<number> {
  let rows: Array<{ id: string; title: string; body: string | null }>;
  try {
    rows = await db
      .select({ id: notes.id, title: notes.title, body: notes.body })
      .from(notes)
      .where(
        and(
          isNull(notes.embedding),
          or(
            ne(notes.title, ''),
            sql`${notes.body} IS NOT NULL`,
          ),
        ),
      )
      .limit(BATCH);
  } catch (err) {
    console.error('[notes-backfill] DB select failed (non-fatal):', err);
    return 0;
  }

  if (rows.length === 0) return 0;

  const texts = rows.map((r) => `${r.title}\n\n${r.body ?? ''}`.trim());

  let vecs: number[][];
  try {
    vecs = await generateEmbeddings(texts);
  } catch (err) {
    // Model failed to load or inference error — skip silently
    return 0;
  }

  let processed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const vec = vecs[i];
    if (!vec || vec.length === 0) continue;
    try {
      const vecStr = `[${vec.join(',')}]`;
      await db.execute(
        sql`UPDATE notes SET embedding = ${vecStr}::vector WHERE id = ${row.id}`,
      );
      processed++;
    } catch (err) {
      console.error(`[notes-backfill] UPDATE failed for note ${row.id} (non-fatal):`, err);
    }
  }

  return processed;
}

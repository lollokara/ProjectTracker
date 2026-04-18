import { NextRequest, NextResponse } from 'next/server';
import { db, notes } from '@tracker/db';
import { eq, isNull, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { embedNote } from '@/lib/notes-embeddings';

// POST /api/notes/backfill-embeddings
// Embeds up to 100 notes that have no embedding. Run in a loop until remaining=0.
export async function POST(_request: NextRequest) {
  try {
    await requireAuth();

    // Fetch a batch of notes missing embeddings
    const batch = await db
      .select({ id: notes.id, title: notes.title, body: notes.body })
      .from(notes)
      .where(isNull(notes.embedding))
      .limit(100);

    let processed = 0;

    for (const note of batch) {
      // Skip notes with no usable text
      const title = note.title ?? '';
      const body = note.body ?? '';
      if (!title.trim() && !body.trim()) continue;

      try {
        const vec = await embedNote({ title, body });
        if (vec !== null) {
          await db
            .update(notes)
            .set({ embedding: vec })
            .where(eq(notes.id, note.id));
          processed++;
        }
      } catch (err) {
        console.error(`[backfill-embeddings] Failed to embed note ${note.id}:`, err);
      }
    }

    // Count remaining null embeddings
    const [{ remaining }] = await db.execute(sql`
      SELECT COUNT(*)::int AS remaining FROM notes WHERE embedding IS NULL
    `) as any[];

    return NextResponse.json({ processed, remaining: remaining ?? 0 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[backfill-embeddings] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

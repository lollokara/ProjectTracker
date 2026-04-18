import { NextRequest, NextResponse } from 'next/server';
import { db, noteSuggestions, notes } from '@tracker/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string; sid: string }> };

// POST /api/projects/[id]/suggestions/[sid]/accept
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id, sid } = await context.params;

    const [suggestion] = await db
      .select()
      .from(noteSuggestions)
      .where(and(eq(noteSuggestions.id, sid), eq(noteSuggestions.projectId, id)))
      .limit(1);

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }
    if (suggestion.status !== 'pending') {
      return NextResponse.json({ error: 'Suggestion already actioned' }, { status: 409 });
    }

    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const [newNote] = await tx
        .insert(notes)
        .values({
          projectId: suggestion.projectId,
          kind: 'todo',
          title: suggestion.text.slice(0, 300),
          body: `${suggestion.keyword}: ${suggestion.text}`,
          sourceType: 'repo_line',
          sourcePath: suggestion.filePath,
          sourceLineStart: suggestion.lineNumber,
          sourceLineEnd: suggestion.lineNumber,
          sourceCommitSha: suggestion.sourceCommitSha,
          priority: 'medium',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const [updatedSuggestion] = await tx
        .update(noteSuggestions)
        .set({ status: 'accepted', acceptedNoteId: newNote.id, updatedAt: now })
        .where(eq(noteSuggestions.id, sid))
        .returning();

      return { note: newNote, suggestion: updatedSuggestion };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

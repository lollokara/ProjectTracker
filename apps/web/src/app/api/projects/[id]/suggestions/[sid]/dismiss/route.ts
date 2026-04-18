import { NextRequest, NextResponse } from 'next/server';
import { db, noteSuggestions } from '@tracker/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string; sid: string }> };

// POST /api/projects/[id]/suggestions/[sid]/dismiss
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

    const [updated] = await db
      .update(noteSuggestions)
      .set({ status: 'dismissed', updatedAt: new Date() })
      .where(eq(noteSuggestions.id, sid))
      .returning();

    return NextResponse.json({ suggestion: updated });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db, noteSuggestions } from '@tracker/db';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/projects/[id]/suggestions?status=pending&limit=50
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? 'pending';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

    const suggestions = await db
      .select()
      .from(noteSuggestions)
      .where(
        and(
          eq(noteSuggestions.projectId, id),
          eq(noteSuggestions.status, status),
        ),
      )
      .orderBy(desc(noteSuggestions.createdAt))
      .limit(limit);

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

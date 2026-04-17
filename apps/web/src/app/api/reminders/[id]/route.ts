import { NextRequest, NextResponse } from 'next/server';
import { db, reminders } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

// DELETE /api/reminders/[id] — cancel a reminder
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [reminder] = await db
      .update(reminders)
      .set({ status: 'cancelled' })
      .where(eq(reminders.id, id))
      .returning();

    if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

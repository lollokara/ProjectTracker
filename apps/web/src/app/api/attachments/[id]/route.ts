import { NextRequest, NextResponse } from 'next/server';
import { db, attachments, activityEvents } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { readFile, unlink } from 'fs/promises';
import path from 'path';

const STORAGE_PATH = process.env.ATTACHMENT_STORAGE_PATH || './data/attachments';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/attachments/[id] — download file
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const filePath = path.join(STORAGE_PATH, attachment.storagePath);
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${attachment.originalName}"`,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/attachments/[id]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const [attachment] = await db.delete(attachments).where(eq(attachments.id, id)).returning();
    if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Delete file from disk
    try {
      const filePath = path.join(STORAGE_PATH, attachment.storagePath);
      await unlink(filePath);
    } catch {
      // File might already be gone
    }

    await db.insert(activityEvents).values({
      projectId: attachment.projectId,
      actor: 'trusted_device',
      eventType: 'attachment_removed',
      entityType: 'attachment',
      entityId: attachment.id,
      payload: { name: attachment.originalName },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

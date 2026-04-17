import { NextRequest, NextResponse } from 'next/server';
import { db, attachments, activityEvents } from '@tracker/db';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { allowedMimes, maxFileSizeBytes } from '@tracker/shared';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const STORAGE_PATH = process.env.ATTACHMENT_STORAGE_PATH || './data/attachments';

// GET /api/attachments?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const result = await db
      .select()
      .from(attachments)
      .where(eq(attachments.projectId, projectId))
      .orderBy(desc(attachments.createdAt));

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/attachments — upload a file
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string;
    const noteId = (formData.get('noteId') as string) || undefined;
    const caption = (formData.get('caption') as string) || undefined;

    if (!file || !projectId) {
      return NextResponse.json({ error: 'file and projectId required' }, { status: 400 });
    }

    // Validate
    if (!allowedMimes.includes(file.type as any)) {
      return NextResponse.json({ error: `File type ${file.type} not allowed` }, { status: 400 });
    }

    if (file.size > maxFileSizeBytes) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
    }

    // Determine type
    const type = file.type.startsWith('image/') ? 'image' : 'document';

    // Save file
    const ext = path.extname(file.name) || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const projectDir = path.join(STORAGE_PATH, projectId);
    await mkdir(projectDir, { recursive: true });

    const filePath = path.join(projectDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const storagePath = `${projectId}/${filename}`;

    const [attachment] = await db
      .insert(attachments)
      .values({
        projectId,
        noteId: noteId || null,
        type,
        originalName: file.name,
        mimeType: file.type,
        storagePath,
        fileSize: file.size,
        caption,
        searchVector: [file.name, caption || ''].join(' '),
      })
      .returning();

    await db.insert(activityEvents).values({
      projectId,
      actor: 'trusted_device',
      eventType: 'attachment_added',
      entityType: 'attachment',
      entityId: attachment.id,
      payload: { name: file.name, type },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[attachments] Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

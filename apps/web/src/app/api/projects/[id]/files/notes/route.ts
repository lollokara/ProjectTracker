import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { safeRepoRelativePath } from '@/lib/repo';
import { listAnchoredNotes } from '@/lib/notes-for-files';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();
    const { id: projectId } = await context.params;

    const rawPath = request.nextUrl.searchParams.get('path') || '';
    if (!rawPath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    let filePath: string;
    try {
      filePath = safeRepoRelativePath(rawPath);
    } catch {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    if (!filePath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const notesList = await listAnchoredNotes({ projectId, filePath });

    return NextResponse.json({ notes: notesList, filePath, projectId });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

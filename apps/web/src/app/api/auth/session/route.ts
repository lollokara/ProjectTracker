import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

// GET /api/auth/session — check current session
export async function GET() {
  try {
    const session = await getSession();
    if (!session.isAuthenticated) {
      return NextResponse.json({ authenticated: false });
    }
    return NextResponse.json({
      authenticated: true,
      deviceId: session.deviceId,
      deviceLabel: session.deviceLabel,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

// DELETE /api/auth/session — logout
export async function DELETE() {
  try {
    const session = await getSession();
    session.destroy();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}

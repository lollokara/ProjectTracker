import { NextRequest, NextResponse } from 'next/server';

// GET /api/push/vapid-key — public VAPID key for client subscription
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 });
  }
  return NextResponse.json({ publicKey: key });
}

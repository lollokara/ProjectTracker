import { NextRequest, NextResponse } from 'next/server';

// GET /api/push/vapid-key — public VAPID key for client subscription
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    console.error('[push] VAPID key missing in env');
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 });
  }
  console.log('[push] VAPID key requested');
  return NextResponse.json({ publicKey: key });
}

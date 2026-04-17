import { NextRequest, NextResponse } from 'next/server';
import { db, pairingTokens } from '@tracker/db';
import { createHash, randomBytes } from 'crypto';
import { requireAuth } from '@/lib/auth';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/generate-token — generate a new pairing token (requires existing auth)
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Generate a short, readable token
    const token = randomBytes(16).toString('hex');
    const hash = hashToken(token);

    // Token valid for 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(pairingTokens).values({
      tokenHash: hash,
      expiresAt,
      createdByDeviceId: session.deviceId,
    });

    console.log(`[auth] Pairing token generated, expires at ${expiresAt.toISOString()}`);

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[auth] Token generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

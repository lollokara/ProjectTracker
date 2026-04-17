import { NextRequest, NextResponse } from 'next/server';
import { db, pairingTokens, trustedDevices, activityEvents } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { getSession } from '@/lib/auth';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/pair — redeem a pairing token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, deviceLabel } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const hash = hashToken(token);

    // Find unconsumed, non-expired token
    const [pairingToken] = await db
      .select()
      .from(pairingTokens)
      .where(eq(pairingTokens.tokenHash, hash))
      .limit(1);

    if (!pairingToken) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    if (pairingToken.consumedAt) {
      return NextResponse.json({ error: 'Token already used' }, { status: 401 });
    }

    if (new Date(pairingToken.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }

    // Create trusted device
    const [device] = await db
      .insert(trustedDevices)
      .values({
        label: deviceLabel || 'My Device',
        tokenHash: hash,
        lastSeenAt: new Date(),
      })
      .returning();

    // Mark token consumed
    await db
      .update(pairingTokens)
      .set({ consumedAt: new Date() })
      .where(eq(pairingTokens.id, pairingToken.id));

    // Create session
    const session = await getSession();
    session.deviceId = device.id;
    session.deviceLabel = device.label;
    session.isAuthenticated = true;
    await session.save();

    // Log activity
    await db.insert(activityEvents).values({
      projectId: '00000000-0000-0000-0000-000000000000', // system event
      actor: 'system',
      eventType: 'device_paired',
      entityType: 'device',
      entityId: device.id,
      payload: { label: device.label },
    });

    console.log(`[auth] Device paired: ${device.label} (${device.id})`);

    return NextResponse.json({
      success: true,
      device: { id: device.id, label: device.label },
    });
  } catch (error: any) {
    console.error('[auth] Pairing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

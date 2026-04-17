import { NextRequest, NextResponse } from 'next/server';
import { db, trustedDevices, activityEvents } from '@tracker/db';
import { eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

// GET /api/devices — list all trusted devices
export async function GET() {
  try {
    await requireAuth();
    const devices = await db
      .select({
        id: trustedDevices.id,
        label: trustedDevices.label,
        lastSeenAt: trustedDevices.lastSeenAt,
        createdAt: trustedDevices.createdAt,
        revokedAt: trustedDevices.revokedAt,
      })
      .from(trustedDevices);

    return NextResponse.json(devices);
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

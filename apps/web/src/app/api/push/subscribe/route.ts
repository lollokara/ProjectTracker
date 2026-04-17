import { NextRequest, NextResponse } from 'next/server';
import { db, pushSubscriptions } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { pushSubscriptionSchema } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';

// POST /api/push/subscribe
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const validated = pushSubscriptionSchema.parse(body);

    // Upsert — avoid duplicate subscriptions for same endpoint
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, validated.endpoint))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(pushSubscriptions)
        .set({
          p256dh: validated.keys.p256dh,
          auth: validated.keys.auth,
          userAgent: validated.userAgent,
          revokedAt: null,
        })
        .where(eq(pushSubscriptions.endpoint, validated.endpoint));
    } else {
      await db.insert(pushSubscriptions).values({
        deviceId: session.deviceId!,
        endpoint: validated.endpoint,
        p256dh: validated.keys.p256dh,
        auth: validated.keys.auth,
        userAgent: validated.userAgent,
      });
    }

    console.log(`[push] Subscription registered for device ${session.deviceId}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db, trustedDevices, activityEvents, projects } from '@tracker/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

// DELETE /api/devices/[id] — revoke a device
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAuth();
    const { id } = await context.params;

    // Prevent revoking own device
    if (id === session.deviceId) {
      return NextResponse.json({ error: 'Cannot revoke own device' }, { status: 400 });
    }

    const [device] = await db
      .update(trustedDevices)
      .set({ revokedAt: new Date() })
      .where(eq(trustedDevices.id, id))
      .returning();

    if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [firstProject] = await db.select({ id: projects.id }).from(projects).limit(1);
    if (firstProject) {
      await db.insert(activityEvents).values({
        projectId: firstProject.id,
        actor: 'trusted_device',
        eventType: 'device_revoked',
        entityType: 'device',
        entityId: device.id,
        payload: { label: device.label },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

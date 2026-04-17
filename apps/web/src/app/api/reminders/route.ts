import { NextRequest, NextResponse } from 'next/server';
import { db, reminders, activityEvents } from '@tracker/db';
import { eq, desc, and } from 'drizzle-orm';
import { createReminderSchema, type ReminderPreset } from '@tracker/shared';
import { requireAuth } from '@/lib/auth';

function resolvePresetTime(preset: ReminderPreset): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'morning': {
      const morning = new Date(today);
      morning.setHours(9, 0, 0, 0);
      // If it's past 9am, schedule for tomorrow
      if (now >= morning) morning.setDate(morning.getDate() + 1);
      return morning;
    }
    case 'afternoon': {
      const afternoon = new Date(today);
      afternoon.setHours(14, 0, 0, 0);
      if (now >= afternoon) afternoon.setDate(afternoon.getDate() + 1);
      return afternoon;
    }
    case 'in_1_day':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'in_3_days':
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    case 'in_7_days':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'custom':
      throw new Error('Custom preset requires scheduledFor');
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

// GET /api/reminders?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    let query;
    if (projectId) {
      query = db
        .select()
        .from(reminders)
        .where(eq(reminders.projectId, projectId))
        .orderBy(desc(reminders.scheduledFor));
    } else {
      query = db.select().from(reminders).orderBy(desc(reminders.scheduledFor));
    }

    return NextResponse.json(await query);
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/reminders — create a reminder
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const validated = createReminderSchema.parse(body);

    let scheduledFor: Date;
    if (validated.preset === 'custom') {
      if (!validated.scheduledFor) {
        return NextResponse.json({ error: 'scheduledFor required for custom preset' }, { status: 400 });
      }
      scheduledFor = new Date(validated.scheduledFor);
    } else {
      scheduledFor = resolvePresetTime(validated.preset);
    }

    const [reminder] = await db
      .insert(reminders)
      .values({
        projectId: validated.projectId,
        noteId: validated.noteId || null,
        scheduledFor,
        presetSource: validated.preset,
        notificationPayload: {
          title: validated.title,
          body: validated.body || '',
          data: {
            projectId: validated.projectId,
            noteId: validated.noteId,
          },
        },
      })
      .returning();

    await db.insert(activityEvents).values({
      projectId: validated.projectId,
      actor: 'trusted_device',
      eventType: 'reminder_created',
      entityType: 'reminder',
      entityId: reminder.id,
      payload: { scheduledFor, preset: validated.preset },
    });

    return NextResponse.json(reminder, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

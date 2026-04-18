import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

// Load .env from root
const result = config({ path: path.resolve(process.cwd(), '../../.env') });
console.log('[worker] Env load result:', result.error ? 'ERROR' : 'SUCCESS');
console.log('[worker] DATABASE_URL in index:', process.env.DATABASE_URL ? 'PRESENT' : 'MISSING');

import { db, reminders, pushSubscriptions, activityEvents } from '@tracker/db';
import { eq, lte, and, isNull } from 'drizzle-orm';
import webpush from 'web-push';
import { runIndexer } from './lib/indexer';

// ── Config ───────────────────────────────────────────────────────────
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '60000', 10);
const INDEX_INTERVAL = parseInt(process.env.WORKER_INDEX_INTERVAL_MS || '300000', 10); // 5 mins default

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@localhost';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  console.log('[worker] VAPID configured');
} else {
  console.warn('[worker] VAPID keys not set — push delivery will be skipped');
}

// ── Reminder Dispatcher ──────────────────────────────────────────────
async function processDueReminders() {
  console.log('[worker] Checking for due reminders...');
  const now = new Date();

  try {
    const dueReminders = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.status, 'pending'), lte(reminders.scheduledFor, now)));

    console.log(`[worker] Query complete. Found ${dueReminders.length} due reminder(s)`);
    if (dueReminders.length === 0) return;

    for (const reminder of dueReminders) {
      try {
        // Fetch active push subscriptions
        const subs = await db
          .select()
          .from(pushSubscriptions)
          .where(isNull(pushSubscriptions.revokedAt));

        const payload = JSON.stringify(
          reminder.notificationPayload || {
            title: 'Project Tracker Reminder',
            body: `Reminder for your project`,
            data: {
              projectId: reminder.projectId,
              noteId: reminder.noteId,
              reminderId: reminder.id,
            },
          },
        );

        let delivered = false;

        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload,
            );
            delivered = true;
            console.log(`[worker] Push sent to subscription ${sub.id}`);
          } catch (err: any) {
            console.error(`[worker] Push failed for sub ${sub.id}:`, err.message);
            // If subscription is expired/invalid, mark it revoked
            if (err.statusCode === 410 || err.statusCode === 404) {
              await db
                .update(pushSubscriptions)
                .set({ revokedAt: now })
                .where(eq(pushSubscriptions.id, sub.id));
            }
          }
        }

        // Update reminder status
        await db
          .update(reminders)
          .set({
            status: delivered ? 'delivered' : 'failed',
            deliveredAt: delivered ? now : null,
          })
          .where(eq(reminders.id, reminder.id));

        // Log activity event
        await db.insert(activityEvents).values({
          projectId: reminder.projectId,
          actor: 'system',
          eventType: 'reminder_delivered',
          entityType: 'reminder',
          entityId: reminder.id,
          payload: { delivered, subscriptionCount: subs.length },
        });

        console.log(
          `[worker] Reminder ${reminder.id} processed: ${delivered ? 'delivered' : 'failed'}`,
        );
      } catch (err) {
        console.error(`[worker] Error processing reminder ${reminder.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[worker] Error in processDueReminders:', err);
  }
}

// ── Main Loop ────────────────────────────────────────────────────────
async function main() {
  console.log('[worker] Starting project worker...');
  console.log(`[worker] Poll interval: ${POLL_INTERVAL}ms`);
  console.log(`[worker] Index interval: ${INDEX_INTERVAL}ms`);

  // Initial runs
  await processDueReminders();
  await runIndexer();

  // Reminder polling loop
  setInterval(async () => {
    try {
      await processDueReminders();
    } catch (err) {
      console.error('[worker] Poll cycle error:', err);
    }
  }, POLL_INTERVAL);

  // Indexer polling loop
  setInterval(async () => {
    try {
      await runIndexer();
    } catch (err) {
      console.error('[worker] Indexer cycle error:', err);
    }
  }, INDEX_INTERVAL);
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});

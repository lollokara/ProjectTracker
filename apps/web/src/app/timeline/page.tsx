'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { getTimeline } from '@/lib/api';

const eventIcons: Record<string, string> = {
  project_created: '📁',
  project_updated: '✏️',
  project_deleted: '🗑',
  note_created: '📝',
  note_updated: '✏️',
  note_deleted: '🗑',
  todo_completed: '✅',
  todo_uncompleted: '↻',
  attachment_added: '📎',
  attachment_removed: '🗑',
  reminder_created: '⏰',
  reminder_delivered: '🔔',
  device_paired: '📱',
  device_revoked: '🚫',
};

const eventLabels: Record<string, string> = {
  project_created: 'Project created',
  project_updated: 'Project updated',
  project_deleted: 'Project deleted',
  note_created: 'Note added',
  note_updated: 'Note updated',
  note_deleted: 'Note deleted',
  todo_completed: 'Todo completed',
  todo_uncompleted: 'Todo uncompleted',
  attachment_added: 'Attachment added',
  attachment_removed: 'Attachment removed',
  reminder_created: 'Reminder set',
  reminder_delivered: 'Reminder delivered',
  device_paired: 'Device paired',
  device_revoked: 'Device revoked',
};

export default function TimelinePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimeline();
  }, []);

  async function loadTimeline() {
    try {
      const data = await getTimeline(undefined, 100);
      setEvents(data);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setLoading(false);
    }
  }

  // Group events by date
  const grouped = events.reduce(
    (acc, event) => {
      const date = new Date(event.occurredAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  return (
    <AppShell title="Timeline">
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '3rem' }}>
          Loading...
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '4rem 0' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>◷</div>
          <p>No activity yet</p>
        </div>
      ) : (
        <div>
          {Object.entries(grouped).map(([date, dayEvents]) => (
            <div key={date} style={{ marginBottom: '2rem' }}>
              {/* Date header */}
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.75rem',
                  paddingLeft: '2rem',
                }}
              >
                {date}
              </div>

              {/* Events */}
              <div style={{ position: 'relative', paddingLeft: '2rem' }}>
                {/* Timeline line */}
                <div
                  style={{
                    position: 'absolute',
                    left: '0.625rem',
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: 'var(--color-border-glass)',
                  }}
                />
                {(dayEvents as any[]).map((event: any, idx: number) => (
                  <div
                    key={event.id}
                    style={{
                      position: 'relative',
                      marginBottom: '0.75rem',
                      animation: `fade-in 0.3s ease-out ${idx * 0.02}s both`,
                    }}
                  >
                    {/* Dot */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '-1.625rem',
                        top: '0.625rem',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background:
                          event.eventType === 'todo_completed'
                            ? 'var(--color-accent-success)'
                            : 'var(--color-accent-primary)',
                        boxShadow: `0 0 8px ${
                          event.eventType === 'todo_completed'
                            ? 'rgba(0,230,118,0.3)'
                            : 'rgba(0,255,200,0.3)'
                        }`,
                      }}
                    />

                    <Link
                      href={
                        event.projectId !== '00000000-0000-0000-0000-000000000000'
                          ? `/projects/${event.projectId}`
                          : '#'
                      }
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="glass-card" style={{ padding: '0.875rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.2rem',
                          }}
                        >
                          <span>{eventIcons[event.eventType] || '•'}</span>
                          <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                            {eventLabels[event.eventType] || event.eventType}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.7rem',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          <span>{event.projectTitle || ''}</span>
                          <span>
                            {new Date(event.occurredAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

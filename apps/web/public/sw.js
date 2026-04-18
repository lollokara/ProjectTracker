const CACHE_NAME = 'tracker-v2';
const OFFLINE_URL = '/offline.html';

// ── Install ──────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    }),
  );
  self.clients.claim();
});

// ── Fetch (network-first with offline fallback) ──────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(OFFLINE_URL).then((response) => {
        return response || new Response('Offline', { status: 503 });
      });
    }),
  );
});

// ── Push Notification ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'Project Tracker';
    const options = {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.data?.reminderId || 'default',
      data: data.data || {},
      vibrate: [100, 50, 100],
      actions: [{ action: 'open', title: 'Open' }],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback for plain text payloads
    const body = event.data.text();
    event.waitUntil(
      self.registration.showNotification('Project Tracker', {
        body,
        icon: '/icons/icon-192.png',
      }),
    );
  }
});

// ── Notification Click (deep-link back into project) ─────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/projects';

  if (data.projectId) {
    url = `/projects/${data.projectId}`;
    if (data.noteId) {
      url += `?note=${data.noteId}`;
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    }),
  );
});

'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/AppShell';
import { getDevices, revokeDevice, generateToken, getVapidKey, subscribePush, logout, getServerStatus } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<any[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<string>('');
  const [pushStatus, setPushStatus] = useState<string>('unknown');
  const [pushError, setPushError] = useState<string>('');
  const [enablingPush, setEnablingPush] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [serverStatusError, setServerStatusError] = useState('');
  const [loadingServerStatus, setLoadingServerStatus] = useState(false);

  useEffect(() => {
    loadDevices();
    checkPushStatus();
    loadServerStatus();
  }, []);

  async function loadDevices() {
    try {
      const data = await getDevices();
      setDevices(data);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  }

  async function checkPushStatus() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
      return;
    }
    const permission = Notification.permission;
    setPushStatus(permission);
  }

  async function handleGenerateToken() {
    try {
      const data = await generateToken();
      setNewToken(data.token);
      setTokenExpiry(new Date(data.expiresAt).toLocaleTimeString());
    } catch (err) {
      console.error('Failed to generate token:', err);
    }
  }

  async function handleRevokeDevice(id: string) {
    if (!confirm('Revoke access for this device?')) return;
    try {
      await revokeDevice(id);
      loadDevices();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleEnableNotifications() {
    setEnablingPush(true);
    setPushError('');
    let step = 'start';
    try {
      step = 'capability-check';
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push APIs not available on this device/context');
      }

      // Register service worker
      step = 'service-worker-register';
      let reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      }
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Service worker ready timeout')), 8000),
        ),
      ]);

      // Request permission
      step = 'notification-permission';
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        return;
      }

      // Get VAPID key
      step = 'fetch-vapid-key';
      const { publicKey } = await getVapidKey();

      // Reuse existing subscription if present
      step = 'push-subscribe';
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      // Register on server
      step = 'register-subscription-server';
      await subscribePush(subscription);
      setPushStatus('granted');
    } catch (err: any) {
      console.error('Push setup failed:', err);
      setPushStatus('error');
      const message = `Failed at ${step}: ${err?.message || 'Unknown push setup error'}`;
      setPushError(message);
      alert(message);
    } finally {
      setEnablingPush(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.push('/pair');
  }

  async function loadServerStatus() {
    setLoadingServerStatus(true);
    setServerStatusError('');
    try {
      const data = await getServerStatus();
      setServerStatus(data);
    } catch (err: any) {
      setServerStatusError(err.message || 'Unable to fetch server status');
    } finally {
      setLoadingServerStatus(false);
    }
  }

  return (
    <AppShell title="Settings">
      {/* Notifications */}
      <section className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          🔔 Notifications
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background:
                pushStatus === 'granted'
                  ? 'var(--color-accent-success)'
                  : pushStatus === 'denied'
                  ? 'var(--color-accent-danger)'
                  : 'var(--color-accent-warning)',
            }}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            {pushStatus === 'granted'
              ? 'Push notifications enabled'
              : pushStatus === 'denied'
              ? 'Notifications blocked – enable in browser settings'
              : pushStatus === 'unsupported'
              ? 'Push not supported on this device'
              : pushStatus === 'error'
              ? 'Push setup failed'
              : 'Notifications not yet enabled'}
          </span>
        </div>
        {pushError && (
          <div
            style={{
              marginTop: '0.625rem',
              fontSize: '0.78rem',
              color: 'var(--color-accent-danger)',
            }}
          >
            {pushError}
          </div>
        )}
        {pushStatus !== 'granted' && pushStatus !== 'unsupported' && pushStatus !== 'denied' && (
          <button
            className="btn-primary"
            onClick={handleEnableNotifications}
            disabled={enablingPush}
            style={{ marginTop: '0.75rem', width: '100%', opacity: enablingPush ? 0.7 : 1 }}
          >
            {enablingPush ? 'Enabling...' : 'Enable Notifications'}
          </button>
        )}
      </section>

      {/* Server Status */}
      <section className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>🖥️ Server Status</h2>
          <button
            className="btn-secondary"
            onClick={loadServerStatus}
            disabled={loadingServerStatus}
            style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
          >
            {loadingServerStatus ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {serverStatusError && (
          <p style={{ color: 'var(--color-accent-danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            {serverStatusError}
          </p>
        )}

        {!serverStatus ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
            {loadingServerStatus ? 'Loading status...' : 'No status data yet'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
            <StatusTile label="App Uptime" value={`${Math.floor(serverStatus.process.uptimeSeconds / 3600)}h`} />
            <StatusTile
              label="DB"
              value={serverStatus.database.healthy ? `OK (${serverStatus.database.latencyMs ?? '-'}ms)` : 'DOWN'}
              good={serverStatus.database.healthy}
            />
            <StatusTile label="Memory RSS" value={`${serverStatus.memory.rssMb} MB`} />
            <StatusTile
              label="Disk Used"
              value={serverStatus.disk.available ? `${serverStatus.disk.usedPct}%` : 'Unavailable'}
              good={serverStatus.disk.available}
            />
            <StatusTile label="Node" value={serverStatus.process.node} />
            <StatusTile label="Host Uptime" value={`${Math.floor(serverStatus.os.uptimeSeconds / 3600)}h`} />
          </div>
        )}

        {serverStatus && (
          <div style={{ marginTop: '0.625rem', fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div>Last refresh {new Date(serverStatus.now).toLocaleString()}</div>
            <div>Attachments {serverStatus.disk.attachmentPath}</div>
            <div>Repos {serverStatus.disk.repoPath}</div>
          </div>
        )}
      </section>

      {/* Devices */}
      <section className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>📱 Trusted Devices</h2>
          <button className="btn-secondary" onClick={handleGenerateToken} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>
            + Pair New
          </button>
        </div>

        {newToken && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0, 255, 200, 0.05)',
              border: '1px solid rgba(0, 255, 200, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              Pairing Token (expires at {tokenExpiry})
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.1rem',
                fontWeight: 600,
                color: 'var(--color-accent-primary)',
                letterSpacing: '0.1em',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {newToken}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {devices
            .filter((device) => !device.revokedAt)
            .map((device) => (
            <div
              key={device.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{device.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  {device.revokedAt
                    ? `Revoked ${new Date(device.revokedAt).toLocaleDateString()}`
                    : device.lastSeenAt
                    ? `Last seen ${new Date(device.lastSeenAt).toLocaleDateString()}`
                    : `Added ${new Date(device.createdAt).toLocaleDateString()}`}
                </div>
              </div>
              <button
                onClick={() => handleRevokeDevice(device.id)}
                style={{
                  padding: '0.375rem 0.625rem',
                  fontSize: '0.7rem',
                  color: 'var(--color-accent-danger)',
                  background: 'rgba(255, 45, 85, 0.08)',
                  border: '1px solid rgba(255, 45, 85, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>

        {devices.some((d) => d.revokedAt) && (
          <>
            <button
              onClick={() => setShowRevoked((v) => !v)}
              style={{
                width: '100%',
                marginTop: '0.9rem',
                marginBottom: showRevoked ? '0.5rem' : 0,
                padding: '0.5rem 0.75rem',
                fontSize: '0.78rem',
                color: 'var(--color-text-muted)',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--color-border-glass)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {showRevoked ? '▾' : '▸'} Revoked ({devices.filter((d) => d.revokedAt).length})
            </button>
            {showRevoked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {devices
                  .filter((device) => !!device.revokedAt)
                  .map((device) => (
                    <div
                      key={device.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(255,255,255,0.01)',
                        opacity: 0.6,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{device.label}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                          Revoked {new Date(device.revokedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* App Info */}
      <section className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>ℹ️ About</h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          <p>Project Tracker V1</p>
          <p>Self-hosted • Single-user • Secure</p>
        </div>
      </section>

      {/* Logout */}
      <button
        className="btn-danger"
        onClick={handleLogout}
        style={{ width: '100%', padding: '0.875rem' }}
      >
        Log Out
      </button>
    </AppShell>
  );
}

function StatusTile({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div
      style={{
        padding: '0.625rem',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${good === undefined ? 'var(--color-border-glass)' : good ? 'rgba(57,255,20,0.3)' : 'rgba(255,45,85,0.3)'}`,
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

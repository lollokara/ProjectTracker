'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pairDevice } from '@/lib/api';

export default function PairDevicePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await pairDevice(token.trim(), deviceLabel.trim() || 'My Device');
      router.push('/projects');
    } catch (err: any) {
      setError(err.message || 'Pairing failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '2rem',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div
          style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1.5rem',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #00ffc8, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
          }}
        >
          ◈
        </div>

        <h1
          style={{
            textAlign: 'center',
            fontSize: '1.75rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
          }}
        >
          Pair Device
        </h1>

        <p
          style={{
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            marginBottom: '2rem',
            fontSize: '0.9rem',
          }}
        >
          Enter your pairing token to connect this device.
        </p>

        <form onSubmit={handlePair}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '0.375rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Pairing Token
            </label>
            <input
              className="input-field"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your token..."
              required
              autoFocus
              autoComplete="off"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '0.375rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Device Name
            </label>
            <input
              className="input-field"
              type="text"
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="e.g. iPhone, MacBook..."
            />
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 45, 85, 0.1)',
                border: '1px solid rgba(255, 45, 85, 0.3)',
                color: 'var(--color-accent-danger)',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !token.trim()}
            style={{
              width: '100%',
              padding: '0.875rem',
              fontSize: '1rem',
              opacity: loading || !token.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Pairing...' : 'Pair This Device'}
          </button>
        </form>
      </div>
    </main>
  );
}

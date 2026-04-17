'use client';

import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh' }}>
      {/* Header */}
      {title && (
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            background: 'rgba(10, 10, 20, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--color-border-glass)',
            padding: '0.75rem 1.25rem',
            paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          }}
        >
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {title}
          </h1>
        </header>
      )}

      {/* Content */}
      <main
        style={{
          padding: '1rem 1rem 5rem',
          maxWidth: '800px',
          margin: '0 auto',
        }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}

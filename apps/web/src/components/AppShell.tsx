'use client';

import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const headerHeight = 'calc(2.8rem + env(safe-area-inset-top))';

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh' }}>
      {/* Header */}
      {title && (
        <header
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            height: headerHeight,
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(10, 10, 20, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--color-border-glass)',
            padding: '0.5rem 1.25rem',
            paddingTop: 'env(safe-area-inset-top)',
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
          padding: title
            ? `calc(${headerHeight} + 0.1rem) 1rem calc(4.5rem + env(safe-area-inset-bottom))`
            : '1rem 1rem 5rem',
          boxSizing: 'border-box',
          minHeight: title ? `calc(100dvh - ${headerHeight})` : '100dvh',
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

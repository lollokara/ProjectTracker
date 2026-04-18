'use client';

import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const headerHeight = '3.5rem';

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', background: 'var(--color-bg-primary)' }}>
      {/* Header */}
      {title && (
        <header
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'rgba(10, 10, 20, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--color-border-glass)',
            paddingTop: 'env(safe-area-inset-top)',
          }}
        >
          <div style={{ height: headerHeight, display: 'flex', alignItems: 'center', padding: '0 1.25rem' }}>
            <h1
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </h1>
          </div>
        </header>
      )}

      {/* Content */}
      <main
        style={{
          paddingTop: title 
            ? `calc(${headerHeight} + env(safe-area-inset-top) + 0.5rem)` 
            : 'calc(env(safe-area-inset-top) + 0.5rem)',
          paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right))',
          boxSizing: 'border-box',
          minHeight: '100dvh',
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

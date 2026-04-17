'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/projects', label: 'Projects', icon: '◈' },
  { href: '/search', label: 'Search', icon: '⌕' },
  { href: '/timeline', label: 'Timeline', icon: '◷' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(10, 10, 20, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--color-border-glass)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: '0.5rem',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
      }}
    >
      {navItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              padding: '0.25rem 0.75rem',
              fontSize: '0.7rem',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
          >
            <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

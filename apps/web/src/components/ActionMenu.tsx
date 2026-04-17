'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface LongPressAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface ActionMenuProps {
  actions: LongPressAction[];
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}

export function ActionMenu({ actions, isOpen, position, onClose }: ActionMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 998,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
        }}
      />
      {/* Menu */}
      <div
        className="animate-slide-up glass-card"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          padding: '0.5rem',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '4px',
            background: 'var(--color-text-muted)',
            borderRadius: '2px',
            margin: '0.5rem auto 1rem',
          }}
        />
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={() => {
              action.onClick();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '1rem 1.25rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: action.variant === 'danger' ? 'var(--color-accent-danger)' : 'var(--color-text-primary)',
              background: action.variant === 'danger' ? 'rgba(255, 45, 85, 0.08)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${action.variant === 'danger' ? 'rgba(255, 45, 85, 0.25)' : 'var(--color-border-glass)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
              marginBottom: '0.5rem',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background =
                action.variant === 'danger' ? 'rgba(255, 45, 85, 0.14)' : 'rgba(255,255,255,0.08)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background =
                action.variant === 'danger' ? 'rgba(255, 45, 85, 0.08)' : 'rgba(255,255,255,0.04)';
            }}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
        <button
          onClick={onClose}
          style={{
            display: 'block',
            width: '100%',
            padding: '1rem',
            marginTop: '0.25rem',
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--color-border-glass)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

// Hook for long-press detection
export function useLongPress(callback: (e: React.TouchEvent | React.MouseEvent) => void, delay = 500) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(e);
    }, delay);
  }, [delay]);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
  };
}

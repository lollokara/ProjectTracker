'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { search as searchApi } from '@/lib/api';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await searchApi(query.trim());
      setResults(data.results);
      setTotal(data.total);
      setSearched(true);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const typeIcons: Record<string, string> = {
    project: '◈',
    note: '📝',
    attachment: '📎',
  };

  return (
    <AppShell title="Search">
      <form onSubmit={handleSearch} style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <input
          className="input-field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects, notes, todos, attachments..."
          autoFocus
          style={{
            paddingRight: '4rem',
            fontSize: '1rem',
            padding: '0.875rem 1rem',
          }}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{
            position: 'absolute',
            right: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '0.5rem 1rem',
            fontSize: '0.8rem',
          }}
        >
          {loading ? '...' : '⌕'}
        </button>
      </form>

      {searched && (
        <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          {total} result{total !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.map((result, idx) => (
            <Link
              key={`${result.type}-${result.id}`}
              href={result.type === 'project' ? `/projects/${result.id}` : `/projects/${result.projectId}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                className="glass-card"
                style={{
                  padding: '1rem',
                  animation: `fade-in 0.3s ease-out ${idx * 0.03}s both`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{typeIcons[result.type] || '•'}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{result.title}</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {result.type}
                  </span>
                </div>
                {result.summary && (
                  <p
                    style={{
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.8rem',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {result.summary}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {searched && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>⌕</div>
          <p>No results found</p>
        </div>
      )}
    </AppShell>
  );
}

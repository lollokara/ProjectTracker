'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { search as searchApi } from '@/lib/api';
import type { SearchMatch } from '@/lib/search';
import { highlightMatch } from '@/lib/search-highlight';

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [codeResults, setCodeResults] = useState<SearchMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setCodeResults([]);
      setSearched(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchApi(query.trim(), { includeRepos: true });
        setResults(data.results);
        setCodeResults((data.codeResults ?? []) as SearchMatch[]);
        setTotal(data.total);
        setSearched(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const typeIcons: Record<string, string> = {
    project: '◈',
    note: '📝',
    attachment: '📎',
  };

  const hasResults = results.length > 0 || codeResults.length > 0;

  return (
    <AppShell title="Search">
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <input
          className="input-field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects, notes, todos, attachments, code..."
          autoFocus
          style={{ fontSize: '1rem', padding: '0.875rem 3rem 0.875rem 1rem' }}
        />
        {loading && (
          <span
            style={{
              position: 'absolute',
              right: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              fontSize: '1rem',
            }}
          >
            ···
          </span>
        )}
      </div>

      {searched && (
        <div style={{ marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          {total} result{total !== 1 ? 's' : ''}{codeResults.length > 0 ? ` · ${codeResults.length} code match${codeResults.length !== 1 ? 'es' : ''}` : ''} for &ldquo;{query}&rdquo;
        </div>
      )}

      {hasResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.map((result, idx) => (
            <Link
              key={`${result.type}-${result.id}`}
              href={result.type === 'project' ? `/projects/${result.id}` : `/projects/${result.projectId}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                className="glass-card"
                style={{ padding: '1rem', animation: `fade-in 0.3s ease-out ${idx * 0.03}s both` }}
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

          {codeResults.length > 0 && (
            <>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '0.5rem 0 0.25rem',
                }}
              >
                Code matches
              </div>
              {codeResults.map((match, idx) => {
                const parentDir = match.filePath.split('/').slice(0, -1).join('/');
                const editorUrl =
                  `/repos/${match.projectId}/editor?path=${encodeURIComponent(match.filePath)}` +
                  (match.lineNumber ? `#L${match.lineNumber}` : '');
                const browseUrl =
                  `/repos/${match.projectId}` +
                  (parentDir ? `?path=${encodeURIComponent(parentDir)}` : '');

                return (
                  <div
                    key={`code-${match.id}`}
                    className="glass-card"
                    onClick={() => router.push(editorUrl)}
                    style={{
                      padding: '1rem',
                      borderLeft: '3px solid var(--color-accent-primary)',
                      animation: `fade-in 0.3s ease-out ${idx * 0.03}s both`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {highlightMatch(match.fileName, query)}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-mono)',
                          flexShrink: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {highlightMatch(match.filePath, query)}
                      </span>
                      {match.matchType === 'chunk' && match.lineNumber != null && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '9999px',
                            background: 'rgba(255,200,0,0.12)',
                            color: 'rgba(255,200,0,0.85)',
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          L{match.lineNumber}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '9999px',
                          background: 'rgba(255,255,255,0.07)',
                          color: 'var(--color-text-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {match.projectTitle}
                      </span>
                      {match.noteCount > 0 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/repos/${match.projectId}/editor?path=${encodeURIComponent(match.filePath)}&peek=notes` +
                                (match.lineNumber ? `#L${match.lineNumber}` : '')
                            );
                          }}
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '9999px',
                            background: 'rgba(255,215,0,0.12)',
                            color: 'var(--color-accent-warning)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          📝 {match.noteCount}
                        </span>
                      )}
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '9999px',
                          background: match.matchType === 'file'
                            ? 'rgba(0,245,255,0.1)'
                            : 'rgba(255,200,0,0.1)',
                          color: match.matchType === 'file'
                            ? 'var(--color-accent-primary)'
                            : 'rgba(255,200,0,0.9)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {match.matchType === 'file' ? 'file' : `line ${match.lineNumber}`}
                      </span>
                    </div>

                    {(match.matchType === 'chunk' ? (match.matchedLineText || match.preview) : match.preview) && (
                      <pre
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--color-text-secondary)',
                          fontFamily: 'var(--font-mono)',
                          lineHeight: 1.5,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: match.matchType === 'chunk' ? 1 : 3,
                          WebkitBoxOrient: 'vertical',
                          whiteSpace: 'pre-wrap',
                          margin: '0 0 0.5rem 0',
                        }}
                      >
                        {match.matchType === 'chunk'
                          ? highlightMatch(match.matchedLineText || match.preview || '', query)
                          : highlightMatch(match.preview || '', query)}
                      </pre>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(browseUrl);
                        }}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '4px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'transparent',
                          color: 'var(--color-text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        Go to file
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {searched && !hasResults && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>⌕</div>
          <p>No results found</p>
        </div>
      )}
    </AppShell>
  );
}

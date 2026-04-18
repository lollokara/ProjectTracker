'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getProjectRepoFile } from '@/lib/api';
import { useLongPress } from '@/components/ActionMenu';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';

export function getLanguageFromExtension(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx': return 'typescript';
    case 'js':
    case 'jsx': return 'javascript';
    case 'css': return 'css';
    case 'md': return 'markdown';
    case 'json': return 'json';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'sh':
    case 'bash': return 'bash';
    default: return 'clike';
  }
}

interface RepoFileViewerProps {
  projectId: string;
  filePath: string;
  initialLine?: number;
  onBack?: () => void;
  onCreateNote?: (sourceInfo: {
    title: string;
    body: string;
    kind: 'note';
    priority: 'medium';
    sourceType: 'repo_line';
    sourcePath: string;
    sourceLineStart: number;
    sourceLineEnd: number;
    sourceCommitSha?: string;
  }) => void;
}

export function RepoFileViewer({ projectId, filePath, initialLine, onBack, onCreateNote }: RepoFileViewerProps) {
  const [fileData, setFileData] = useState<{ path: string; size: number; content: string; commitSha: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const didScrollRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    didScrollRef.current = false;
    getProjectRepoFile(projectId, filePath)
      .then(setFileData)
      .catch((e: any) => setError(e.message || 'Failed to load file'))
      .finally(() => setLoading(false));
  }, [projectId, filePath]);

  const { highlightedLines, rawLines } = useMemo(() => {
    if (!fileData) return { highlightedLines: [], rawLines: [] };

    const content = fileData.content.replace(/\\n/g, '\n');
    const rawLines = content.split('\n');

    const lang = getLanguageFromExtension(fileData.path);
    const grammar = Prism.languages[lang] || Prism.languages.clike;
    const html = Prism.highlight(content, grammar, lang);

    const lines = html.split('\n');
    const openTags: string[] = [];
    const highlightedLines = lines.map((line) => {
      let newLine = openTags.join('') + line;
      const tagRegex = /<span class="([^"]+)">|<\/span>/g;
      let match;
      while ((match = tagRegex.exec(line)) !== null) {
        if (match[0].startsWith('<span')) {
          openTags.push(match[0]);
        } else {
          openTags.pop();
        }
      }
      if (openTags.length > 0) {
        newLine += '</span>'.repeat(openTags.length);
      }
      return newLine;
    });

    return { highlightedLines, rawLines };
  }, [fileData]);

  // Scroll to initial line after render
  useEffect(() => {
    if (!initialLine || didScrollRef.current || highlightedLines.length === 0) return;
    const el = document.getElementById(`L${initialLine}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      didScrollRef.current = true;
    }
  }, [initialLine, highlightedLines]);

  const pathParts = filePath ? filePath.split('/') : [];

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ color: 'var(--color-accent-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
          {error}
          {onBack && (
            <div style={{ marginTop: '1rem' }}>
              <button className="btn-secondary" onClick={onBack} style={{ fontSize: '0.8rem' }}>
                ← Go back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!fileData) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--color-border-glass)',
        background: 'rgba(10, 10, 20, 0.85)',
        backdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'var(--color-bg-glass)',
                border: '1px solid var(--color-border-glass)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.3rem 0.6rem',
                fontSize: '0.75rem',
                flexShrink: 0,
              }}
            >
              ← Back
            </button>
          )}
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', overflow: 'hidden', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            {pathParts.map((part, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: i < pathParts.length - 1 ? 1 : 0, overflow: 'hidden' }}>
                {i > 0 && <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>/</span>}
                <span style={{
                  color: i === pathParts.length - 1 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, marginLeft: '0.75rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            {(fileData.size / 1024).toFixed(1)} KB · {rawLines.length} lines
          </span>
          {fileData.commitSha && (
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {fileData.commitSha.slice(0, 7)}
            </span>
          )}
        </div>
      </div>

      {/* Code */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem 0', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6 }}>
        {highlightedLines.map((html, idx) => (
          <CodeLine
            key={idx + 1}
            lineNo={idx + 1}
            html={html}
            rawLine={rawLines[idx]}
            repoFile={fileData}
            isHighlighted={initialLine === idx + 1}
            onAddNote={onCreateNote ? (metadata) => onCreateNote(metadata) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function CodeLine({
  lineNo,
  html,
  rawLine,
  repoFile,
  isHighlighted,
  onAddNote,
}: {
  lineNo: number;
  html: string;
  rawLine: string;
  repoFile: { path: string; commitSha: string | null };
  isHighlighted?: boolean;
  onAddNote?: (metadata: any) => void;
}) {
  const handleAddNote = () => {
    if (!onAddNote) return;
    onAddNote({
      title: `Code comment ${repoFile.path}:${lineNo}`,
      body: rawLine,
      kind: 'note',
      priority: 'medium',
      sourceType: 'repo_line',
      sourcePath: repoFile.path,
      sourceLineStart: lineNo,
      sourceLineEnd: lineNo,
      sourceCommitSha: repoFile.commitSha || undefined,
    });
  };

  const longPressHandlers = useLongPress(onAddNote ? handleAddNote : () => {});

  return (
    <div
      id={`L${lineNo}`}
      style={{
        display: 'flex',
        gap: '0.35rem',
        borderBottom: '1px solid rgba(255,255,255,0.02)',
        padding: '0.05rem 0',
        background: isHighlighted ? 'rgba(0, 255, 200, 0.07)' : undefined,
        borderLeft: isHighlighted ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
      }}
      {...(onAddNote ? longPressHandlers : {})}
      className="no-select"
    >
      <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0, width: '1.8rem', justifyContent: 'flex-end', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '0.2rem', marginRight: '0.2rem' }}>
        {onAddNote && (
          <button
            title="Add note"
            onClick={handleAddNote}
            style={{ border: 'none', background: 'transparent', color: 'var(--color-accent-primary)', cursor: 'pointer', fontSize: '0.65rem', padding: 0, opacity: 0.3 }}
          >
            +
          </button>
        )}
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', userSelect: 'none', minWidth: '1rem', textAlign: 'right' }}>{lineNo}</span>
      </div>
      <span
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1, fontSize: '0.75rem' }}
        dangerouslySetInnerHTML={{ __html: html || ' ' }}
      />
    </div>
  );
}

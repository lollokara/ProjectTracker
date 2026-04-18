'use client';

import { useState, useEffect, use, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { useLongPress } from '@/components/ActionMenu';
import {
  getProject,
  syncProjectRepo, 
  getProjectRepoTree, 
  getProjectRepoFile, 
  searchProjectRepo,
  createNote
} from '@/lib/api';
import { PROJECT_ICON_TO_EMOJI } from '@/lib/project-visuals';
import { Project, Note, Priority } from '@tracker/shared';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';

import { File, Folder, FileCode, FileJson, FileText, Image as ImageIcon, ChevronLeft, Search, RefreshCw, X } from 'lucide-react';

function getLanguageFromExtension(path: string): string {
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

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'py': case 'go': case 'rs': case 'java': case 'c': case 'cpp':
      return <FileCode size={16} />;
    case 'json': case 'yaml': case 'yml':
      return <FileJson size={16} />;
    case 'md': case 'txt':
      return <FileText size={16} />;
    case 'png': case 'jpg': case 'jpeg': case 'svg': case 'gif':
      return <ImageIcon size={16} />;
    default:
      return <File size={16} />;
  }
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

export default function RepoBrowserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [repoTree, setRepoTree] = useState<any[]>([]);
  const [repoPath, setRepoPath] = useState('');
  const [repoFile, setRepoFile] = useState<{ path: string; size: number; content: string; commitSha: string | null } | null>(null);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [repoSearchMode, setRepoSearchMode] = useState<'exact' | 'semantic'>('exact');
  const [repoSearchResults, setRepoSearchResults] = useState<any[]>([]);
  const [repoSyncing, setRepoSyncing] = useState(false);

  const [showAddNote, setShowAddNote] = useState(false);
  const [noteForm, setNoteForm] = useState<{
    title: string;
    body: string;
    kind: 'note' | 'snippet' | 'todo';
    priority: Priority;
    sourceType?: 'repo_line' | 'repo_file';
    sourcePath?: string;
    sourceLineStart?: number;
    sourceLineEnd?: number;
    sourceCommitSha?: string;
  }>({
    title: '',
    body: '',
    kind: 'note',
    priority: 'medium',
  });
  const [savingNote, setSavingNote] = useState(false);
  const addNoteFormRef = useRef<HTMLFormElement | null>(null);

  const { highlightedLines, rawLines } = useMemo(() => {
    if (!repoFile) return { highlightedLines: [], rawLines: [] };
    
    const content = repoFile.content.replace(/\\n/g, '\n');
    const rawLines = content.split('\n');
    
    const lang = getLanguageFromExtension(repoFile.path);
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
  }, [repoFile]);

  async function loadProject() {
    const p = await getProject(id);
    setProject(p);
  }

  async function loadRepoTree(path = '') {
    const tree = await getProjectRepoTree(id, path);
    setRepoPath(tree.path);
    setRepoTree(tree.items.sort((a: any, b: any) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.name.localeCompare(b.name);
    }));
  }

  async function openRepoFile(path: string) {
    const file = await getProjectRepoFile(id, path);
    setRepoFile(file);
    document.body.style.overflow = 'hidden';
  }

  function closeRepoFile() {
    setRepoFile(null);
    document.body.style.overflow = '';
  }

  async function handleRepoSync() {
    setRepoSyncing(true);
    try {
      await syncProjectRepo(id);
      await loadProject();
      await loadRepoTree('');
    } finally {
      setRepoSyncing(false);
    }
  }

  async function handleRepoSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = repoSearchQuery.trim();
    if (!q) {
      setRepoSearchResults([]);
      return;
    }
    const results = await searchProjectRepo(id, q, repoSearchMode);
    setRepoSearchResults(results.results);
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (savingNote) return;
    setSavingNote(true);
    try {
      await createNote({
        projectId: id,
        ...noteForm,
      });
      setShowAddNote(false);
      alert('Note saved to project!');
    } catch (err) {
      console.error(err);
      alert('Failed to save note');
    } finally {
      setSavingNote(false);
    }
  }

  useEffect(() => {
    const isSyncingStatus = ['syncing', 'cloning', 'fetching', 'pulling'].includes(project?.repoLastSyncStatus || '');
    const isIndexing = project?.repoLastCommitSha !== project?.repoLastIndexedCommitSha;
    if (!repoSyncing && !isSyncingStatus && !isIndexing) return;

    const interval = setInterval(async () => {
      try {
        const p = await getProject(id);
        setProject(p);
        
        const stillSyncing = ['syncing', 'cloning', 'fetching', 'pulling'].includes(p.repoLastSyncStatus || '');
        const stillIndexing = p.repoLastCommitSha !== p.repoLastIndexedCommitSha;

        if (!stillSyncing && !stillIndexing) {
          setRepoSyncing(false);
          if (p.repoLastSyncStatus === 'ok') {
            loadRepoTree(repoPath || '');
          }
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Polling project failed:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, repoSyncing, project?.repoLastSyncStatus, project?.repoLastCommitSha, project?.repoLastIndexedCommitSha]);

  useEffect(() => {
    loadProject();
    return () => {
      document.body.style.overflow = '';
    };
  }, [id]);

  useEffect(() => {
    if (project?.repoLastSyncStatus !== 'ok') return;
    loadRepoTree(repoPath || '').catch(console.error);
  }, [project?.repoLastSyncStatus]);

  if (!project) return (
    <div style={{ '--color-accent-primary': '#00ffc8', '--color-accent-primary-rgb': '0, 255, 200' } as any}>
    <AppShell title="Loading..."><div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading...</div></AppShell>
    </div>
  );

  const rgb = hexToRgb(project.themeColor);

  return (
    <div style={{ 
      '--color-accent-primary': project.themeColor, 
      '--color-accent-primary-rgb': rgb || project.themeColor 
    } as any}>
    <AppShell title={`${PROJECT_ICON_TO_EMOJI[project.icon] || '📁'} ${project.title} - Code`}>
      <div style={{ marginBottom: '1.25rem' }}>
        <button className="btn-secondary" onClick={() => router.push('/repos')} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <ChevronLeft size={16} /> Back to Repos
        </button>
      </div>

      <div className="glass-card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
            {project.repositoryUrl || 'No repository URL configured'}
          </span>
          <button 
            className="btn-primary" 
            disabled={repoSyncing || !project.repositoryUrl} 
            onClick={handleRepoSync}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {repoSyncing ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'flex' }}><RefreshCw size={14}/></motion.span>
                {['syncing', 'cloning', 'fetching', 'pulling'].includes(project.repoLastSyncStatus || '') ? project.repoLastSyncStatus : 'Syncing...'}
              </>
            ) : project.repoLastSyncStatus === 'ok' ? <><RefreshCw size={14}/> Sync Repo</> : 'Clone Repo'}
          </button>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span>Last sync: {project.repoLastSyncAt ? new Date(project.repoLastSyncAt).toLocaleString() : 'never'} · Status: <span className={`badge ${project.repoLastSyncStatus === 'ok' ? 'status-active' : 'status-paused'}`}>{project.repoLastSyncStatus || 'not_synced'}</span></span>
          {project.repoLastIndexedAt && (
            <span>Last indexed: {new Date(project.repoLastIndexedAt).toLocaleString()}</span>
          )}
          {project.repoLastIndexedCommitSha === project.repoLastCommitSha ? (
            <span style={{ color: 'var(--color-accent-primary)' }}>✨ Indexed</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
              <span style={{ color: 'var(--color-accent-warning)', whiteSpace: 'nowrap' }}>⌛ Indexing AI Search...</span>
              <div style={{ flex: 1, height: '6px', background: 'var(--color-bg-glass)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(((project.repoIndexingProgress || 0) / (project.repoIndexingTotal || 1)) * 100)}%` }}
                  style={{ height: '100%', background: 'var(--color-accent-primary)', boxShadow: '0 0 10px var(--color-accent-primary)' }}
                />
              </div>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {Math.round(((project.repoIndexingProgress || 0) / (project.repoIndexingTotal || 1)) * 100)}%
              </span>
            </div>
          )}
        </div>
        {project.repoLastSyncError && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--color-accent-danger)', padding: '0.5rem', background: 'rgba(255, 45, 85, 0.05)', borderRadius: 'var(--radius-sm)' }}>
            Error: {project.repoLastSyncError}
          </div>
        )}
      </div>

      {project.repoLastSyncStatus === 'ok' && (
        <>
          <form onSubmit={handleRepoSearchSubmit} className="glass-card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  className="input-field"
                  value={repoSearchQuery}
                  onChange={(e) => setRepoSearchQuery(e.target.value)}
                  placeholder="Search in code..."
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                />
              </div>
              <button className="btn-secondary" type="submit">Search</button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
              <button 
                type="button" 
                onClick={() => setRepoSearchMode('exact')}
                style={{ 
                  flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: repoSearchMode === 'exact' ? 'var(--color-accent-primary)' : 'var(--color-bg-glass)',
                  color: repoSearchMode === 'exact' ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                Exact Match (rg)
              </button>
              <button 
                type="button" 
                onClick={() => setRepoSearchMode('semantic')}
                style={{ 
                  flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: repoSearchMode === 'semantic' ? 'var(--color-accent-primary)' : 'var(--color-bg-glass)',
                  color: repoSearchMode === 'semantic' ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
                  fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', transition: 'all 0.2s'
                }}
              >
                <span>✨</span> Semantic (Local AI)
              </button>
            </div>
          </form>

          {repoSearchResults.length > 0 && (
            <div className="glass-card" style={{ padding: '0.75rem', marginBottom: '1.25rem', maxHeight: '30vh', overflow: 'auto' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
                Found {repoSearchResults.length} results
              </div>
              {repoSearchResults.map((res, idx) => (
                <button
                  key={`${res.path}:${res.line}:${idx}`}
                  onClick={async () => {
                    await openRepoFile(res.path);
                    setRepoSearchResults([]);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'var(--color-bg-glass)',
                    border: '1px solid var(--color-border-glass)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-glass)'}
                >
                  <strong style={{ color: 'var(--color-text-primary)' }}>{res.path}:{res.line}</strong> 
                  <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.preview}</span>
                </button>
              ))}
            </div>
          )}

          <div className="glass-card" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--color-border-glass)', background: 'rgba(0,0,0,0.2)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {repoPath ? `/${repoPath}` : '/'}
              </span>
              {repoPath && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const parent = repoPath.split('/').slice(0, -1).join('/');
                    loadRepoTree(parent);
                  }}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  ↑ Up
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {repoTree.map((item) => (
                  <button
                    key={`${item.path}-${item.sha || item.name}`}
                    onClick={() => {
                      if (item.type === 'tree') {
                        loadRepoTree(item.path);
                      } else {
                        openRepoFile(item.path);
                      }
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ color: item.type === 'tree' ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                      {item.type === 'tree' ? <Folder size={18} fill="currentColor" fillOpacity={0.2} /> : getFileIcon(item.name)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Full screen editor overlay */}
      <AnimatePresence>
        {repoFile && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{ 
              position: 'fixed', 
              inset: 0, 
              zIndex: 1000, 
              background: 'var(--color-bg-primary)', 
              display: 'flex', 
              flexDirection: 'column',
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div style={{ 
              padding: '0.75rem 1rem', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              borderBottom: '1px solid var(--color-border-glass)', 
              background: 'rgba(10, 10, 20, 0.85)',
              backdropFilter: 'blur(20px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                <button
                  onClick={closeRepoFile}
                  style={{ background: 'var(--color-bg-glass)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.3rem', flexShrink: 0 }}
                  title="Close file"
                >
                  <X size={18} />
                </button>
                <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {repoFile.path}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {(repoFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>
            
            <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem 0', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6 }}>
              {highlightedLines.map((html, idx) => (
                <CodeLine
                  key={`${idx + 1}`}
                  lineNo={idx + 1}
                  html={html}
                  rawLine={rawLines[idx]}
                  repoFile={repoFile}
                  onAddNote={(metadata) => {
                    setNoteForm(metadata);
                    setShowAddNote(true);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAddNote && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)' }}>
          <form ref={addNoteFormRef} onSubmit={handleAddNote} className="glass-card animate-slide-up" style={{ padding: '1.25rem', width: '100%', maxWidth: '500px', border: '1px solid var(--color-accent-primary)' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>Create Note from Code</h3>
            {noteForm.sourcePath && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-accent-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-glass)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                <span>📍 {noteForm.sourcePath}:{noteForm.sourceLineStart}</span>
              </div>
            )}
            <input className="input-field" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="Title..." required style={{ marginBottom: '0.75rem' }} autoFocus />
            <textarea className="input-field" value={noteForm.body} onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })} placeholder="Details..." rows={4} style={{ marginBottom: '0.75rem', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select className="input-field" value={noteForm.priority} onChange={(e) => setNoteForm({ ...noteForm, priority: e.target.value as Priority })} style={{ flex: 1 }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn-primary" disabled={savingNote} style={{ flex: 1, opacity: savingNote ? 0.7 : 1 }}>
                {savingNote ? 'Saving...' : 'Save Note'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowAddNote(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
    </div>
  );
}

function CodeLine({ 
  lineNo, 
  html, 
  rawLine, 
  repoFile, 
  onAddNote 
}: { 
  lineNo: number; 
  html: string; 
  rawLine: string; 
  repoFile: any; 
  onAddNote: (metadata: any) => void;
}) {
  const onLongPress = () => {
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

  const longPressHandlers = useLongPress(onLongPress);

  return (
    <div
      style={{ display: 'flex', gap: '0.35rem', borderBottom: '1px solid rgba(255,255,255,0.02)', padding: '0.05rem 0' }}
      {...longPressHandlers}
      className="no-select"
    >
      <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0, width: '1.8rem', justifyContent: 'flex-end', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '0.2rem', marginRight: '0.2rem' }}>
        <button
          title="Add note"
          onClick={onLongPress}
          style={{ border: 'none', background: 'transparent', color: 'var(--color-accent-primary)', cursor: 'pointer', fontSize: '0.65rem', padding: 0, opacity: 0.3 }}
        >
          +
        </button>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', userSelect: 'none', minWidth: '1rem', textAlign: 'right' }}>{lineNo}</span>
      </div>
      <span 
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1, fontSize: '0.75rem' }}
        dangerouslySetInnerHTML={{ __html: html || ' ' }}
      />
    </div>
  );
}

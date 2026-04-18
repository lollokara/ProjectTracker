import { db, codeFiles } from '@tracker/db';
import { sql } from 'drizzle-orm';
import * as path from 'path';
import { generateQueryEmbedding } from '@/lib/embeddings';

export type SearchMatch = {
  id: string;
  projectId: string;
  projectTitle: string;
  filePath: string;
  fileName: string;
  matchType: 'file' | 'chunk';
  score: number;
  preview: string | null;
  lineNumber: number | null;
};

// ── Tiny in-module LRU for query embeddings (size 64) ─────────────────
const LRU_SIZE = 64;
const embeddingCache = new Map<string, number[]>();

async function getCachedEmbedding(q: string): Promise<number[]> {
  const key = q.trim().toLowerCase();
  if (embeddingCache.has(key)) {
    // Move to end (most-recently-used)
    const val = embeddingCache.get(key)!;
    embeddingCache.delete(key);
    embeddingCache.set(key, val);
    return val;
  }
  const vec = await generateQueryEmbedding(q);
  if (embeddingCache.size >= LRU_SIZE) {
    // Evict the oldest (first) entry
    const firstKey = embeddingCache.keys().next().value as string;
    embeddingCache.delete(firstKey);
  }
  embeddingCache.set(key, vec);
  return vec;
}

// ── JS-side trigram-like similarity fallback for chunk-only hits ──────
function jsSimilarity(str: string, q: string): number {
  const s = str.toLowerCase();
  const query = q.toLowerCase();
  if (s.includes(query)) return 0.5;
  // Check individual words
  const words = query.split(/\s+/).filter(Boolean);
  if (words.some((w) => s.includes(w))) return 0.3;
  return 0;
}

export async function hybridRepoSearch(opts: {
  query: string;
  projectId?: string;
  limit?: number;
}): Promise<SearchMatch[]> {
  const { query, projectId, limit = 25 } = opts;
  const q = query.trim();

  // ── Short-query fallback: return recently-edited files ────────────
  if (q.length < 2) {
    const rows = projectId
      ? await db.execute(sql`
          SELECT cf.id, cf.project_id, cf.file_path, cf.file_name, cf.title_snippet,
                 cf.last_commit_at, cf.updated_at, p.title AS project_title
          FROM code_files cf
          JOIN projects p ON p.id = cf.project_id
          WHERE cf.project_id = ${projectId}
          ORDER BY COALESCE(cf.last_commit_at, cf.updated_at) DESC
          LIMIT 25
        `)
      : await db.execute(sql`
          SELECT cf.id, cf.project_id, cf.file_path, cf.file_name, cf.title_snippet,
                 cf.last_commit_at, cf.updated_at, p.title AS project_title
          FROM code_files cf
          JOIN projects p ON p.id = cf.project_id
          ORDER BY COALESCE(cf.last_commit_at, cf.updated_at) DESC
          LIMIT 25
        `);

    return (rows as any[]).map((r) => ({
      id: r.id as string,
      projectId: r.project_id as string,
      projectTitle: r.project_title as string,
      filePath: r.file_path as string,
      fileName: r.file_name as string,
      matchType: 'file' as const,
      score: 0,
      preview: (r.title_snippet as string | null) ?? null,
      lineNumber: null,
    }));
  }

  // ── Full query path ───────────────────────────────────────────────
  const embedding = await getCachedEmbedding(q);
  const vecStr = `[${embedding.join(',')}]`;
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;

  // 1. File candidates via pg_trgm
  const fileRows = projectId
    ? await db.execute(sql`
        SELECT cf.id, cf.project_id, cf.file_path, cf.file_name, cf.title_snippet,
               cf.last_commit_at, cf.updated_at, p.title AS project_title,
               similarity(cf.file_name, ${q}) AS s_name,
               similarity(cf.file_path, ${q}) AS s_path,
               similarity(COALESCE(cf.title_snippet, ''), ${q}) AS s_title
        FROM code_files cf
        JOIN projects p ON p.id = cf.project_id
        WHERE cf.project_id = ${projectId}
          AND (cf.file_name % ${q} OR cf.file_path % ${q}
               OR cf.title_snippet % ${q} OR cf.file_name ILIKE ${like})
        ORDER BY GREATEST(
          similarity(cf.file_name, ${q}),
          similarity(cf.file_path, ${q}) * 0.8,
          similarity(COALESCE(cf.title_snippet, ''), ${q}) * 0.7
        ) DESC
        LIMIT 60
      `)
    : await db.execute(sql`
        SELECT cf.id, cf.project_id, cf.file_path, cf.file_name, cf.title_snippet,
               cf.last_commit_at, cf.updated_at, p.title AS project_title,
               similarity(cf.file_name, ${q}) AS s_name,
               similarity(cf.file_path, ${q}) AS s_path,
               similarity(COALESCE(cf.title_snippet, ''), ${q}) AS s_title
        FROM code_files cf
        JOIN projects p ON p.id = cf.project_id
        WHERE cf.file_name % ${q} OR cf.file_path % ${q}
              OR cf.title_snippet % ${q} OR cf.file_name ILIKE ${like}
        ORDER BY GREATEST(
          similarity(cf.file_name, ${q}),
          similarity(cf.file_path, ${q}) * 0.8,
          similarity(COALESCE(cf.title_snippet, ''), ${q}) * 0.7
        ) DESC
        LIMIT 60
      `);

  // 2. Chunk candidates via pgvector HNSW (best row per file)
  const chunkRows = projectId
    ? await db.execute(sql`
        SELECT DISTINCT ON (ce.project_id, ce.file_path)
          ce.id, ce.project_id, ce.file_path, ce.line_number, ce.content,
          p.title AS project_title,
          (1 - (ce.embedding <=> ${vecStr}::vector)) AS sem
        FROM code_embeddings ce
        JOIN projects p ON p.id = ce.project_id
        WHERE (1 - (ce.embedding <=> ${vecStr}::vector)) > 0.25
          AND ce.project_id = ${projectId}
        ORDER BY ce.project_id, ce.file_path, ce.embedding <=> ${vecStr}::vector
        LIMIT 60
      `)
    : await db.execute(sql`
        SELECT DISTINCT ON (ce.project_id, ce.file_path)
          ce.id, ce.project_id, ce.file_path, ce.line_number, ce.content,
          p.title AS project_title,
          (1 - (ce.embedding <=> ${vecStr}::vector)) AS sem
        FROM code_embeddings ce
        JOIN projects p ON p.id = ce.project_id
        WHERE (1 - (ce.embedding <=> ${vecStr}::vector)) > 0.25
        ORDER BY ce.project_id, ce.file_path, ce.embedding <=> ${vecStr}::vector
        LIMIT 60
      `);

  // ── Merge into Map keyed by projectId::filePath ───────────────────
  type Candidate = {
    id: string;
    projectId: string;
    projectTitle: string;
    filePath: string;
    fileName: string;
    titleSnippet: string | null;
    lastCommitAt: Date | null;
    updatedAt: Date | null;
    sName: number;
    sPath: number;
    sTitle: number;
    sem: number;
    lineNumber: number | null;
    chunkContent: string | null;
    hasFile: boolean;
  };

  const map = new Map<string, Candidate>();

  for (const r of fileRows as any[]) {
    const key = `${r.project_id}::${r.file_path}`;
    map.set(key, {
      id: r.id as string,
      projectId: r.project_id as string,
      projectTitle: r.project_title as string,
      filePath: r.file_path as string,
      fileName: r.file_name as string,
      titleSnippet: (r.title_snippet as string | null) ?? null,
      lastCommitAt: r.last_commit_at ? new Date(r.last_commit_at as string) : null,
      updatedAt: r.updated_at ? new Date(r.updated_at as string) : null,
      sName: parseFloat(r.s_name as string) || 0,
      sPath: parseFloat(r.s_path as string) || 0,
      sTitle: parseFloat(r.s_title as string) || 0,
      sem: 0,
      lineNumber: null,
      chunkContent: null,
      hasFile: true,
    });
  }

  for (const r of chunkRows as any[]) {
    const key = `${r.project_id}::${r.file_path}`;
    const sem = parseFloat(r.sem as string) || 0;
    const content = (r.content as string) ?? '';
    // Strip "File: ...\n\n" header from chunk content
    const preview = content.replace(/^File:[^\n]*\n\n/, '');

    if (map.has(key)) {
      const c = map.get(key)!;
      c.sem = sem;
      c.lineNumber = r.line_number as number;
      c.chunkContent = preview;
    } else {
      const fp = r.file_path as string;
      map.set(key, {
        id: r.id as string,
        projectId: r.project_id as string,
        projectTitle: r.project_title as string,
        filePath: fp,
        fileName: path.basename(fp),
        titleSnippet: null,
        lastCommitAt: null,
        updatedAt: null,
        // JS fallback similarity for chunk-only hits
        sName: jsSimilarity(path.basename(fp), q),
        sPath: jsSimilarity(fp, q) * 0.8,
        sTitle: 0,
        sem,
        lineNumber: r.line_number as number,
        chunkContent: preview,
        hasFile: false,
      });
    }
  }

  // ── Score each candidate ──────────────────────────────────────────
  const now = Date.now();

  const scored: SearchMatch[] = Array.from(map.values()).map((c) => {
    const refDate = c.lastCommitAt ?? c.updatedAt;
    const ageDays = refDate ? (now - refDate.getTime()) / 86400000 : 365;
    const sFresh = Math.exp(-ageDays / 30);
    const sType =
      q.length <= 32 &&
      (/readme/i.test(c.fileName) || /\.(md|txt)$/i.test(c.fileName))
        ? 1
        : 0;

    const score =
      0.4 * c.sName +
      0.15 * c.sPath +
      0.1 * c.sTitle +
      0.25 * c.sem +
      0.08 * sFresh +
      0.02 * sType;

    const matchType: 'file' | 'chunk' = c.hasFile ? 'file' : 'chunk';
    const preview = c.hasFile
      ? (c.titleSnippet ?? c.chunkContent)
      : c.chunkContent;

    return {
      id: c.id,
      projectId: c.projectId,
      projectTitle: c.projectTitle,
      filePath: c.filePath,
      fileName: c.fileName,
      matchType,
      score,
      preview: preview ?? null,
      lineNumber: c.lineNumber,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

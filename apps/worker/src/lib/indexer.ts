import { db, projects, codeEmbeddings, codeFiles } from '@tracker/db';
import { eq, and, isNotNull, sql, inArray } from 'drizzle-orm';
import { readFile, readdir, stat } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { generateEmbeddings } from './embeddings';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rs', '.rb', '.php', '.md', '.sql', '.yaml', '.yml', '.json', '.sh'
]);

const MAX_FILE_SIZE = 500 * 1024; // 500KB cap for indexing
const CHUNK_SIZE = 30;  // Lines per chunk
const CHUNK_OVERLAP = 5; // Overlap lines

interface FileChunk {
  filePath: string;
  lineNumber: number;
  content: string;
}

interface CodeFileRow {
  projectId: string;
  filePath: string;
  fileName: string;
  extension: string | null;
  language: string | null;
  sizeBytes: number;
  lineCount: number;
  titleSnippet: string | null;
  lastCommitAt: Date | null;
  lastCommitSha: string | null;
}

type GitLogMap = Map<string, { lastCommitAt: Date; lastCommitSha: string }>;

function deriveLanguage(ext: string): string {
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'javascript';
    case '.py':
      return 'python';
    case '.md':
      return 'markdown';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    case '.rb':
      return 'ruby';
    case '.php':
      return 'php';
    case '.sql':
      return 'sql';
    default:
      return '';
  }
}

function extractTitleSnippet(content: string): string | null {
  const firstNonEmpty = content.split('\n').find(l => l.trim().length > 0);
  if (!firstNonEmpty) return null;

  const trimmed = firstNonEmpty.trim();

  // Markdown heading
  if (trimmed.startsWith('# ')) {
    return trimmed.slice(2, 202).trim() || null;
  }

  // Comment markers
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('"""')
  ) {
    const stripped = trimmed
      .replace(/^\/\/\s*/, '')
      .replace(/^#\s*/, '')
      .replace(/^\/\*+\s*/, '')
      .replace(/^"""\s*/, '');
    return stripped.slice(0, 200).trim() || null;
  }

  return trimmed.slice(0, 200) || null;
}

async function buildGitLogMap(projectDir: string): Promise<GitLogMap> {
  const map: GitLogMap = new Map();
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--name-only', '--pretty=format:%H%x09%cI'],
      { cwd: projectDir, timeout: 60_000 }
    );

    if (!stdout.trim()) return map;

    let currentSha = '';
    let currentDate = '';

    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Header line: "<sha>\t<iso-date>"
      if (trimmed.includes('\t')) {
        const tabIdx = trimmed.indexOf('\t');
        currentSha = trimmed.slice(0, tabIdx).trim();
        currentDate = trimmed.slice(tabIdx + 1).trim();
        continue;
      }

      // File path line
      if (currentSha && currentDate && trimmed) {
        if (!map.has(trimmed)) {
          map.set(trimmed, {
            lastCommitAt: new Date(currentDate),
            lastCommitSha: currentSha,
          });
        }
      }
    }
  } catch {
    // Shallow clone or git unavailable — return empty map
  }
  return map;
}

export async function runIndexer() {
  console.log('[indexer] Starting indexing cycle...');

  try {
    const projectsToIndex = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.repoLastSyncStatus, 'ok'),
          isNotNull(projects.repoLastCommitSha),
          sql`${projects.repoLastCommitSha} != COALESCE(${projects.repoLastIndexedCommitSha}, '')`
        )
      );

    console.log(`[indexer] Found ${projectsToIndex.length} project(s) to index.`);

    for (const project of projectsToIndex) {
      await indexProject(project);
    }
  } catch (err) {
    console.error('[indexer] Error in indexing cycle:', err);
  }
}

async function getChangedFiles(projectDir: string, fromSha: string, toSha: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMRT', fromSha, toSha],
      { cwd: projectDir, timeout: 30_000 }
    );
    return stdout.split('\n').filter(Boolean);
  } catch {
    // Shallow clone may not have old commit — fall back to full re-index
    return null;
  }
}

async function getDeletedFiles(projectDir: string, fromSha: string, toSha: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-only', '--diff-filter=D', fromSha, toSha],
      { cwd: projectDir, timeout: 30_000 }
    );
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function indexProject(project: any) {
  const repoPath = process.env.REPO_STORAGE_PATH || '/data/repos';
  const projectDir = path.join(repoPath, project.id);

  console.log(`[indexer] Indexing project: ${project.title} (${project.id})`);

  try {
    await stat(projectDir);

    const prevSha = project.repoLastIndexedCommitSha;
    const newSha = project.repoLastCommitSha;
    const isFirstIndex = !prevSha;

    if (!isFirstIndex) {
      // Try incremental indexing — only changed files
      const changed = await getChangedFiles(projectDir, prevSha, newSha);
      const deleted = await getDeletedFiles(projectDir, prevSha, newSha);

      if (changed !== null) {
        const allAffected = [...new Set([...changed, ...deleted])];
        console.log(`[indexer] Incremental: ${changed.length} changed, ${deleted.length} deleted files.`);
        await incrementalIndex(project, projectDir, changed, allAffected, newSha);
        return;
      }

      console.log(`[indexer] git diff unavailable (shallow clone?), falling back to full re-index.`);
    }

    await fullIndex(project, projectDir, newSha);
  } catch (err) {
    console.error(`[indexer] Failed to index project ${project.id}:`, err);
  }
}

async function incrementalIndex(
  project: any,
  projectDir: string,
  changedFiles: string[],
  affectedFiles: string[],
  newSha: string
) {
  // Delete embeddings and file rows for affected files
  if (affectedFiles.length > 0) {
    await db
      .delete(codeEmbeddings)
      .where(
        and(
          eq(codeEmbeddings.projectId, project.id),
          inArray(codeEmbeddings.filePath, affectedFiles)
        )
      );
    await db
      .delete(codeFiles)
      .where(
        and(
          eq(codeFiles.projectId, project.id),
          inArray(codeFiles.filePath, affectedFiles)
        )
      );
  }

  // Build git log map once for this project
  const gitLogMap = await buildGitLogMap(projectDir);

  // Re-index only changed (non-deleted) files
  const chunks: FileChunk[] = [];
  const fileRows: CodeFileRow[] = [];
  for (const relPath of changedFiles) {
    const fullPath = path.join(projectDir, relPath);
    try {
      await processFile(project.id, fullPath, relPath, chunks, fileRows, gitLogMap);
    } catch {
      // File may have been deleted — skip
    }
  }

  if (chunks.length > 0 || fileRows.length > 0) {
    await insertChunks(project, chunks, fileRows);
  }

  await db
    .update(projects)
    .set({ repoLastIndexedCommitSha: newSha, repoLastIndexedAt: new Date() })
    .where(eq(projects.id, project.id));

  console.log(`[indexer] Incremental index complete for: ${project.title} (${chunks.length} chunks updated)`);
}

async function fullIndex(project: any, projectDir: string, newSha: string) {
  // Build git log map once for this project
  const gitLogMap = await buildGitLogMap(projectDir);

  const chunks: FileChunk[] = [];
  const fileRows: CodeFileRow[] = [];
  await walkDir(project.id, projectDir, projectDir, chunks, fileRows, gitLogMap);

  console.log(`[indexer] Full index: ${chunks.length} chunks for ${project.title}. Generating embeddings...`);

  await db
    .update(projects)
    .set({ repoIndexingProgress: 0, repoIndexingTotal: chunks.length })
    .where(eq(projects.id, project.id));

  // Delete old embeddings and file rows, then insert new ones in a transaction
  await db.transaction(async (tx) => {
    await tx.delete(codeEmbeddings).where(eq(codeEmbeddings.projectId, project.id));
    await tx.delete(codeFiles).where(eq(codeFiles.projectId, project.id));
    await insertChunks(project, chunks, fileRows, tx);
  });

  await db
    .update(projects)
    .set({ repoLastIndexedCommitSha: newSha, repoLastIndexedAt: new Date() })
    .where(eq(projects.id, project.id));

  console.log(`[indexer] Full index complete for: ${project.title}`);
}

async function insertChunks(project: any, chunks: FileChunk[], fileRows: CodeFileRow[], tx: any = db) {
  const BATCH_SIZE = 50;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch.map(c => c.content));

    await tx.insert(codeEmbeddings).values(
      batch.map((chunk, idx) => ({
        projectId: project.id,
        filePath: chunk.filePath,
        lineNumber: chunk.lineNumber,
        content: chunk.content,
        embedding: `[${embeddings[idx].join(',')}]` as any,
      }))
    );

    const progress = Math.min(i + BATCH_SIZE, chunks.length);
    await db
      .update(projects)
      .set({ repoIndexingProgress: progress })
      .where(eq(projects.id, project.id));

    console.log(`[indexer] ${progress}/${chunks.length} chunks indexed...`);
  }

  // Upsert file-level rows
  if (fileRows.length > 0) {
    const FILE_BATCH = 200;
    for (let i = 0; i < fileRows.length; i += FILE_BATCH) {
      const batch = fileRows.slice(i, i + FILE_BATCH);
      await tx.insert(codeFiles).values(batch).onConflictDoUpdate({
        target: [codeFiles.projectId, codeFiles.filePath],
        set: {
          fileName: sql`excluded.file_name`,
          extension: sql`excluded.extension`,
          language: sql`excluded.language`,
          sizeBytes: sql`excluded.size_bytes`,
          lineCount: sql`excluded.line_count`,
          titleSnippet: sql`excluded.title_snippet`,
          lastCommitAt: sql`excluded.last_commit_at`,
          lastCommitSha: sql`excluded.last_commit_sha`,
          updatedAt: new Date(),
        },
      });
    }
  }
}

async function walkDir(
  projectId: string,
  root: string,
  current: string,
  chunks: FileChunk[],
  fileRows: CodeFileRow[],
  gitLogMap: GitLogMap,
) {
  const entries = await readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relPath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'dist', '.next', '__pycache__', 'vendor', '.venv'].includes(entry.name)) {
        continue;
      }
      await walkDir(projectId, root, fullPath, chunks, fileRows, gitLogMap);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        await processFile(projectId, fullPath, relPath, chunks, fileRows, gitLogMap);
      }
    }
  }
}

async function processFile(
  projectId: string,
  fullPath: string,
  relPath: string,
  chunks: FileChunk[],
  fileRows: CodeFileRow[],
  gitLogMap: GitLogMap,
) {
  try {
    const fileStat = await stat(fullPath);
    if (fileStat.size > MAX_FILE_SIZE) return;

    const content = await readFile(fullPath, 'utf8');
    const lines = content.split('\n');
    const ext = path.extname(relPath).toLowerCase();
    const gitInfo = gitLogMap.get(relPath) ?? null;

    // Build file-level row
    fileRows.push({
      projectId,
      filePath: relPath,
      fileName: path.basename(relPath),
      extension: ext || null,
      language: deriveLanguage(ext) || null,
      sizeBytes: fileStat.size,
      lineCount: lines.length,
      titleSnippet: extractTitleSnippet(content),
      lastCommitAt: gitInfo?.lastCommitAt ?? null,
      lastCommitSha: gitInfo?.lastCommitSha ?? null,
    });

    // Build chunk rows (unchanged logic)
    for (let i = 0; i < lines.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunkLines = lines.slice(i, i + CHUNK_SIZE);
      const chunkContent = chunkLines.join('\n').trim();

      if (chunkContent.length < 10) continue;

      chunks.push({
        filePath: relPath,
        lineNumber: i + 1,
        content: `File: ${relPath}\n\n${chunkContent}`,
      });

      if (i + CHUNK_SIZE >= lines.length) break;
    }
  } catch (err) {
    console.warn(`[indexer] Could not process file ${relPath}:`, err);
  }
}

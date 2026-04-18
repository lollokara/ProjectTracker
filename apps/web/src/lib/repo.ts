import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, readFile, stat } from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

export const MAX_FILE_BYTES = 1024 * 1024; // 1MB preview cap
export const MAX_SEARCH_RESULTS = 200;

function rootDir() {
  return process.env.REPO_STORAGE_PATH || '/data/repos';
}

export function projectRepoDir(projectId: string) {
  return path.join(rootDir(), projectId);
}

export async function ensureRepoRoot() {
  await mkdir(rootDir(), { recursive: true });
}

export async function runGit(args: string[], cwd?: string) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function syncRepo(
  projectId: string,
  repositoryUrl: string,
  onStatus?: (status: string) => Promise<void>
) {
  await ensureRepoRoot();
  const dir = projectRepoDir(projectId);

  try {
    await stat(path.join(dir, '.git'));
    if (onStatus) await onStatus('fetching');
    await runGit(['-C', dir, 'fetch', '--all', '--prune']);
    if (onStatus) await onStatus('pulling');
    await runGit(['-C', dir, 'pull', '--ff-only']);
  } catch {
    if (onStatus) await onStatus('cloning');
    await runGit(['clone', '--depth', '1', repositoryUrl, dir]);
  }

  const commit = await runGit(['-C', dir, 'rev-parse', 'HEAD']);
  return { dir, commit: commit.stdout };
}

export function safeRepoRelativePath(inputPath: string) {
  const cleaned = (inputPath || '').replace(/\\/g, '/').trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('/')) {
    throw new Error('Invalid path');
  }
  const normalized = path.posix.normalize(cleaned);
  if (normalized.startsWith('..')) {
    throw new Error('Invalid path');
  }
  return normalized;
}

export async function listTree(projectId: string, relativePath = '') {
  const dir = projectRepoDir(projectId);
  const rel = safeRepoRelativePath(relativePath);
  // Use 'HEAD:path' syntax to list contents of the directory
  const target = rel ? `HEAD:${rel}` : 'HEAD';
  const { stdout } = await runGit(['-C', dir, 'ls-tree', target]);
  const rows = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, name] = line.split('\t');
      const [mode, type, sha] = meta.split(' ');
      return {
        mode,
        type,
        sha,
        name,
        // The path should be relative to the project root
        path: rel ? `${rel}/${name}` : name,
      };
    })
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'tree' ? -1 : 1;
    });

  return rows;
}

export async function readRepoFile(projectId: string, relativePath: string) {
  const dir = projectRepoDir(projectId);
  const rel = safeRepoRelativePath(relativePath);
  if (!rel) throw new Error('path is required');
  const absolute = path.join(dir, rel);
  const fileStat = await stat(absolute);
  if (fileStat.size > MAX_FILE_BYTES) {
    throw new Error('File too large to preview');
  }
  const content = await readFile(absolute, 'utf8');
  return { path: rel, size: fileStat.size, content };
}

export async function searchRepo(projectId: string, query: string) {
  const dir = projectRepoDir(projectId);
  const q = query.trim();
  if (!q) return [];

  try {
    const { stdout } = await execFileAsync(
      'rg',
      ['--line-number', '--no-heading', '--color', 'never', '--hidden', '--glob', '!.git', q, '.'],
      {
        cwd: dir,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return stdout
      .split('\n')
      .filter(Boolean)
      .slice(0, MAX_SEARCH_RESULTS)
      .map((line) => {
        const first = line.indexOf(':');
        const second = line.indexOf(':', first + 1);
        return {
          path: line.slice(0, first).replace(/^\.\//, ''),
          line: Number(line.slice(first + 1, second)),
          preview: line.slice(second + 1),
        };
      });
  } catch (error: any) {
    if (error.code === 1) return [];
    throw error;
  }
}

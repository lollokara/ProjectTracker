import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, readFile, rm, stat } from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

export const MAX_FILE_BYTES = 1024 * 1024; // 1MB preview cap
export const MAX_SEARCH_RESULTS = 200;

const GIT_SSH_COMMAND =
  'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -F /home/nextjs/.ssh/config';

const GIT_ENV = {
  ...process.env,
  HOME: '/tmp',
  GIT_SSH_COMMAND,
};

function rootDir() {
  return process.env.REPO_STORAGE_PATH || '/data/repos';
}

export function projectRepoDir(projectId: string) {
  return path.join(rootDir(), projectId);
}

export async function ensureRepoRoot() {
  await mkdir(rootDir(), { recursive: true });
}

// execFile already throws on non-zero exit with stderr in the error message.
// We only need to return stdout — no custom stderr handling required.
export async function runGit(args: string[], cwd?: string, timeoutMs = 60_000) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: GIT_ENV,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: stdout.trim() };
}

export async function syncRepo(
  projectId: string,
  repositoryUrl: string,
  onStatus?: (status: string) => Promise<void>
) {
  await ensureRepoRoot();
  const dir = projectRepoDir(projectId);

  // Convert https://github.com/user/repo to git@github.com:user/repo.git
  let gitUrl = repositoryUrl;
  if (gitUrl.startsWith('https://github.com/')) {
    gitUrl = gitUrl.replace('https://github.com/', 'git@github.com:').replace(/\.git$/, '') + '.git';
  }

  // Separate existence check from git operations so a pull failure
  // doesn't accidentally wipe a valid repo directory.
  let hasRepo = false;
  try {
    await stat(path.join(dir, '.git'));
    hasRepo = true;
  } catch {
    // .git not found — will clone
  }

  if (hasRepo) {
    if (onStatus) await onStatus('fetching');
    await runGit(['-C', dir, 'fetch', '--all', '--prune']);
    if (onStatus) await onStatus('pulling');
    await runGit(['-C', dir, 'pull', '--ff-only']);
  } else {
    // Remove any partial/empty dir left by a previous failed clone
    await rm(dir, { recursive: true, force: true });
    if (onStatus) await onStatus('cloning');
    await runGit(['clone', '--depth', '1', gitUrl, dir], undefined, 600_000);
  }

  const { stdout: commit } = await runGit(['-C', dir, 'rev-parse', 'HEAD']);
  return { dir, commit };
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
      // -F: treat query as fixed string (no regex) — prevents ReDoS
      ['--line-number', '--no-heading', '--color', 'never', '-F', '--hidden', '--glob', '!.git', q, '.'],
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
    if (error.code === 1) return []; // rg exit 1 = no matches
    throw error;
  }
}

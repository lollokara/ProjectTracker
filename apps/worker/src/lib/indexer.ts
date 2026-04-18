import { db, projects, codeEmbeddings } from '@tracker/db';
import { eq, ne, and, isNotNull, sql } from 'drizzle-orm';
import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';
import { generateEmbeddings } from './embeddings';

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rs', '.rb', '.php', '.md', '.sql', '.yaml', '.yml', '.json', '.sh'
]);

const MAX_FILE_SIZE = 500 * 1024; // 500KB cap for indexing
const CHUNK_SIZE = 30; // Lines per chunk
const CHUNK_OVERLAP = 5; // Overlap lines

interface FileChunk {
  filePath: string;
  lineNumber: number;
  content: string;
}

export async function runIndexer() {
  console.log('[indexer] Starting indexing cycle...');
  
  try {
    // 1. Find projects that are synced but not yet indexed (or need update)
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

async function indexProject(project: any) {
  const repoPath = process.env.REPO_STORAGE_PATH || '/data/repos';
  const projectDir = path.join(repoPath, project.id);
  
  console.log(`[indexer] Indexing project: ${project.title} (${project.id}) at ${projectDir}`);

  try {
    // Check if directory exists
    await stat(projectDir);
    
    // Clear old embeddings for this project
    await db.delete(codeEmbeddings).where(eq(codeEmbeddings.projectId, project.id));

    const chunks: FileChunk[] = [];
    await walkDir(projectDir, projectDir, chunks);

    console.log(`[indexer] Generated ${chunks.length} chunks for ${project.title}. Generating embeddings...`);

    // Reset progress in DB
    await db
      .update(projects)
      .set({ 
        repoIndexingProgress: 0, 
        repoIndexingTotal: chunks.length 
      })
      .where(eq(projects.id, project.id));

    // Process in batches to avoid OOM and DB timeouts
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchContents = batch.map(c => c.content);
      const embeddings = await generateEmbeddings(batchContents);

      await db.insert(codeEmbeddings).values(
        batch.map((chunk, idx) => ({
          projectId: project.id,
          filePath: chunk.filePath,
          lineNumber: chunk.lineNumber,
          content: chunk.content,
          embedding: `[${embeddings[idx].join(',')}]` as any,
        }))
      );
      
      const currentProgress = Math.min(i + BATCH_SIZE, chunks.length);
      await db
        .update(projects)
        .set({ repoIndexingProgress: currentProgress })
        .where(eq(projects.id, project.id));

      console.log(`[indexer] Indexed ${currentProgress}/${chunks.length} chunks...`);
    }

    // Update project metadata
    await db
      .update(projects)
      .set({
        repoLastIndexedCommitSha: project.repoLastCommitSha,
        repoLastIndexedAt: new Date(),
      })
      .where(eq(projects.id, project.id));

    console.log(`[indexer] Successfully indexed project: ${project.title}`);
  } catch (err) {
    console.error(`[indexer] Failed to index project ${project.id}:`, err);
  }
}

async function walkDir(root: string, current: string, chunks: FileChunk[]) {
  const entries = await readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relPath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      // Skip common ignored dirs
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      await walkDir(root, fullPath, chunks);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        await processFile(fullPath, relPath, chunks);
      }
    }
  }
}

async function processFile(fullPath: string, relPath: string, chunks: FileChunk[]) {
  try {
    const fileStat = await stat(fullPath);
    if (fileStat.size > MAX_FILE_SIZE) return;

    const content = await readFile(fullPath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunkLines = lines.slice(i, i + CHUNK_SIZE);
      const chunkContent = chunkLines.join('\n').trim();
      
      if (chunkContent.length < 10) continue; // Skip tiny chunks

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

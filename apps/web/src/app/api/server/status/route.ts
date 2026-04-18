import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { statfs } from 'fs/promises';
import os from 'os';
import { db } from '@tracker/db';
import { requireAuth } from '@/lib/auth';

function bytesToMB(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

export async function GET() {
  try {
    await requireAuth();

    const startedAt = process.uptime();
    const mem = process.memoryUsage();

    let dbLatencyMs: number | null = null;
    let dbHealthy = false;
    try {
      const t0 = performance.now();
      await db.execute(sql`select 1`);
      dbLatencyMs = Math.round((performance.now() - t0) * 10) / 10;
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const attachmentPath = process.env.ATTACHMENT_STORAGE_PATH || '/data/attachments';
    const repoPath = process.env.REPO_STORAGE_PATH || '/data/repos';
    let disk: {
      attachmentPath: string;
      repoPath: string;
      totalMb: number;
      freeMb: number;
      usedMb: number;
      usedPct: number;
      available: boolean;
    };

    try {
      const stats = await statfs(attachmentPath);
      const blockSize = Number(stats.bsize);
      const total = Number(stats.blocks) * blockSize;
      const free = Number(stats.bavail) * blockSize;
      const used = Math.max(total - free, 0);
      const usedPct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

      disk = {
        attachmentPath,
        repoPath,
        totalMb: bytesToMB(total),
        freeMb: bytesToMB(free),
        usedMb: bytesToMB(used),
        usedPct,
        available: true,
      };
    } catch {
      disk = {
        attachmentPath,
        repoPath,
        totalMb: 0,
        freeMb: 0,
        usedMb: 0,
        usedPct: 0,
        available: false,
      };
    }

    return NextResponse.json({
      now: new Date().toISOString(),
      process: {
        uptimeSeconds: Math.floor(startedAt),
        node: process.version,
        platform: process.platform,
        pid: process.pid,
      },
      memory: {
        rssMb: bytesToMB(mem.rss),
        heapUsedMb: bytesToMB(mem.heapUsed),
        heapTotalMb: bytesToMB(mem.heapTotal),
      },
      os: {
        hostname: os.hostname(),
        uptimeSeconds: Math.floor(os.uptime()),
        loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
      },
      database: {
        healthy: dbHealthy,
        latencyMs: dbLatencyMs,
      },
      disk,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

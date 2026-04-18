import * as chrono from 'chrono-node';
import type { Priority } from '@tracker/shared';

export type EnrichmentHit = {
  kind: 'date' | 'mention' | 'tag' | 'priority' | 'filepath';
  value: string;
  raw: string;
  start: number;
  end: number;
};

export type EnrichmentResult = {
  reminderAt: Date | null;
  mentions: string[];
  tags: string[];
  priority: Priority | null;
  suggestedSourcePath: string | null;
  hits: EnrichmentHit[];
};

const MENTION_RE = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_-]{2,32})/gi;
const TAG_RE = /(?:^|[^A-Za-z0-9_])#([A-Za-z0-9_-]{2,32})/gi;
const FILEPATH_RE =
  /(?:[a-zA-Z0-9_.-]+\/){1,8}[a-zA-Z0-9_.-]+\.(?:ts|tsx|js|jsx|py|go|md|rs|c|cpp|h|hpp|rb|java|sql|yaml|yml|json|sh|txt)/gi;

// Priority keywords in ascending order of severity index
const PRIORITY_BANG_RE = /(?:^|(?<=\s))!(low|medium|med|high|critical|crit)\b/gi;
const PRIORITY_CAPS_RE = /\b(CRITICAL|URGENT|P0|P1|P2|P3)\b/g;

function bangToPriority(raw: string): Priority {
  const lower = raw.toLowerCase();
  if (lower === 'critical' || lower === 'crit') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'medium' || lower === 'med') return 'medium';
  return 'low';
}

function capsToPriority(kw: string): Priority {
  if (kw === 'CRITICAL' || kw === 'P0' || kw === 'P1') return 'critical';
  if (kw === 'URGENT' || kw === 'P2') return 'high';
  if (kw === 'P3') return 'medium';
  return 'medium';
}

const PRIORITY_ORDER: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function higherPriority(a: Priority | null, b: Priority | null): Priority | null {
  if (a === null) return b;
  if (b === null) return a;
  return PRIORITY_ORDER[a] >= PRIORITY_ORDER[b] ? a : b;
}

export function enrichNote(input: { title: string; body?: string | null }): EnrichmentResult {
  const text = input.title + '\n' + (input.body ?? '');
  const hits: EnrichmentHit[] = [];

  // ── Date via chrono-node ──────────────────────────────────────────
  let reminderAt: Date | null = null;
  const now = new Date();
  const margin = new Date(now.getTime() + 60_000); // now + 1 minute
  const parsed = chrono.parse(text, now, { forwardDate: false });
  for (const result of parsed) {
    const candidate = result.date();
    if (candidate > margin) {
      reminderAt = candidate;
      hits.push({
        kind: 'date',
        value: candidate.toISOString(),
        raw: result.text,
        start: result.index,
        end: result.index + result.text.length,
      });
      break; // first future date wins
    }
  }

  // ── Mentions ──────────────────────────────────────────────────────
  const mentionsSeen = new Set<string>();
  const mentions: string[] = [];
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const val = m[1].toLowerCase();
    if (!mentionsSeen.has(val)) {
      mentionsSeen.add(val);
      mentions.push(val);
      const rawStart = m.index + m[0].indexOf('@');
      hits.push({
        kind: 'mention',
        value: val,
        raw: m[0].trimStart(),
        start: rawStart,
        end: rawStart + m[0].trimStart().length,
      });
    }
  }

  // ── Tags ──────────────────────────────────────────────────────────
  const tagsSeen = new Set<string>();
  const tags: string[] = [];
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    const val = m[1].toLowerCase();
    if (!tagsSeen.has(val)) {
      tagsSeen.add(val);
      tags.push(val);
      const rawStart = m.index + m[0].indexOf('#');
      hits.push({
        kind: 'tag',
        value: val,
        raw: m[0].trimStart(),
        start: rawStart,
        end: rawStart + m[0].trimStart().length,
      });
    }
  }

  // ── Priority ──────────────────────────────────────────────────────
  let priority: Priority | null = null;

  PRIORITY_BANG_RE.lastIndex = 0;
  while ((m = PRIORITY_BANG_RE.exec(text)) !== null) {
    const p = bangToPriority(m[1]);
    priority = higherPriority(priority, p);
    hits.push({
      kind: 'priority',
      value: p,
      raw: m[0].trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  PRIORITY_CAPS_RE.lastIndex = 0;
  while ((m = PRIORITY_CAPS_RE.exec(text)) !== null) {
    const p = capsToPriority(m[1]);
    priority = higherPriority(priority, p);
    hits.push({
      kind: 'priority',
      value: p,
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // ── File path ─────────────────────────────────────────────────────
  let suggestedSourcePath: string | null = null;
  FILEPATH_RE.lastIndex = 0;
  while ((m = FILEPATH_RE.exec(text)) !== null) {
    const raw = m[0];
    // Skip paths starting with // or ./
    if (raw.startsWith('//') || raw.startsWith('./')) continue;
    suggestedSourcePath = raw;
    hits.push({
      kind: 'filepath',
      value: raw,
      raw,
      start: m.index,
      end: m.index + raw.length,
    });
    break; // first valid path wins
  }

  return { reminderAt, mentions, tags, priority, suggestedSourcePath, hits };
}

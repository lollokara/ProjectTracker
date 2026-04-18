import type { ProjectIcon } from '@tracker/shared';

export const NEON_PROJECT_COLORS = [
  '#00F5FF',
  '#39FF14',
  '#FF3AF2',
  '#FF8A00',
  '#8B5CF6',
  '#FF2D55',
  '#00FFC2',
  '#FFD60A',
] as const;

export const DEFAULT_PROJECT_ICON: ProjectIcon = 'folder';

export const PROJECT_ICON_TO_EMOJI: Record<ProjectIcon, string> = {
  folder: '📁',
  rocket: '🚀',
  cpu: '🧠',
  server: '🖥️',
  terminal: '⌨️',
  globe: '🌐',
  lightbulb: '💡',
  wrench: '🛠️',
};

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickProjectColor(title: string, usedColors: string[]): string {
  const normalized = new Set(usedColors.map((c) => c.toUpperCase()));
  const free = NEON_PROJECT_COLORS.find((color) => !normalized.has(color.toUpperCase()));
  if (free) return free;

  const idx = hashString(title) % NEON_PROJECT_COLORS.length;
  return NEON_PROJECT_COLORS[idx];
}

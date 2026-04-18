import { generateQueryEmbedding } from './embeddings';

const PROTOTYPES: Record<'note' | 'snippet' | 'todo', string[]> = {
  todo: [
    'remember to fix this bug',
    'implement the new feature',
    'need to refactor this code',
    'remind me to review',
  ],
  snippet: [
    'here is a code example for doing this',
    'reusable helper function to parse input',
    'syntax reference for this API',
    'configuration snippet to copy',
  ],
  note: [
    'general observation about the system',
    'documentation of a decision',
    'meeting notes and follow-ups',
    'information to remember',
  ],
};

let prototypeMatrix: { label: 'note' | 'snippet' | 'todo'; vec: number[] }[] | null = null;

async function ensureProtos() {
  if (prototypeMatrix) return prototypeMatrix;
  const entries: { label: 'note' | 'snippet' | 'todo'; vec: number[] }[] = [];
  for (const [label, sentences] of Object.entries(PROTOTYPES) as Array<[keyof typeof PROTOTYPES, string[]]>) {
    for (const s of sentences) {
      const v = await generateQueryEmbedding(s);
      entries.push({ label, vec: v });
    }
  }
  prototypeMatrix = entries;
  return entries;
}

export async function suggestNoteKind(text: string): Promise<{
  kind: 'note' | 'snippet' | 'todo';
  confidence: number;
} | null> {
  if (!text.trim()) return null;
  try {
    const vec = await generateQueryEmbedding(text);
    const protos = await ensureProtos();
    // cosine: (a·b) since both are L2-normalized by MiniLM mean-pool-norm
    let best: { label: 'note' | 'snippet' | 'todo'; sim: number } | null = null;
    for (const p of protos) {
      let dot = 0;
      for (let i = 0; i < vec.length; i++) dot += vec[i] * p.vec[i];
      if (!best || dot > best.sim) best = { label: p.label, sim: dot };
    }
    if (!best || best.sim < 0.35) return null; // no confident match
    return { kind: best.label, confidence: best.sim };
  } catch {
    return null;
  }
}

import { generateQueryEmbedding } from './embeddings';

/** Combined text used for note embedding: title + body, trimmed. */
export function noteEmbedText(note: { title: string; body?: string | null }): string {
  return `${note.title}\n\n${note.body ?? ''}`.trim();
}

/** Generate a 384-d embedding for a note's title+body. Returns null if text is empty. */
export async function embedNote(note: { title: string; body?: string | null }): Promise<number[] | null> {
  const text = noteEmbedText(note);
  if (!text) return null;
  return generateQueryEmbedding(text);
}

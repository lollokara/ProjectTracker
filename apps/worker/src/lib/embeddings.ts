import { pipeline, env } from '@xenova/transformers';

// Configure transformers to use local cache and avoid external downloads if possible after initial fetch
env.allowLocalModels = true;
env.cacheDir = process.env.MODEL_CACHE_PATH || '/data/models';

let embeddingPipeline: any = null;

export async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('[embeddings] Loading feature-extraction pipeline...');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[embeddings] Pipeline loaded.');
  }
  return embeddingPipeline;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline();
  const results: number[][] = [];
  
  // Process in batches if many
  for (const text of texts) {
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    results.push(Array.from(output.data));
  }
  
  return results;
}

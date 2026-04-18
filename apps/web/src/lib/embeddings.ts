import { pipeline, env } from '@xenova/transformers';

// Configuration
env.allowLocalModels = true;
// In Docker, we'll mount a shared volume for the model cache
env.cacheDir = process.env.MODEL_CACHE_PATH || '/data/models';

let embeddingPipeline: any = null;

export async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('[embeddings] Loading feature-extraction pipeline in web process...');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[embeddings] Pipeline loaded.');
  }
  return embeddingPipeline;
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

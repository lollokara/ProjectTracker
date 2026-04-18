import { pipeline, env } from '@xenova/transformers';

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
  return Array.from(output.data as Float32Array);
}

// Process texts in true batches — one pipeline call per batch instead of N calls.
export async function generateEmbeddings(texts: string[], batchSize = 16): Promise<number[][]> {
  if (texts.length === 0) return [];
  const pipe = await getEmbeddingPipeline();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const output = await pipe(batch, { pooling: 'mean', normalize: true });

    // output.dims = [batchSize, embeddingDim]
    const embeddingDim = output.dims[1];
    const flat = Array.from(output.data as Float32Array);
    for (let j = 0; j < batch.length; j++) {
      results.push(flat.slice(j * embeddingDim, (j + 1) * embeddingDim));
    }
  }

  return results;
}

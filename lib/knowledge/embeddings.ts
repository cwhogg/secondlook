/**
 * Embedding utilities for semantic symptom matching.
 *
 * Uses OpenAI text-embedding-3-small to convert symptom descriptions into
 * numerical vectors. Cosine similarity between vectors captures semantic
 * meaning — "brain fog" and "cognitive dysfunction" will be close together
 * even though they share no words.
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 256;
const MAX_BATCH_SIZE = 2048; // OpenAI allows up to 2048 inputs per request

export type EmbeddingVector = number[];

export interface EmbeddedSymptom {
  symptomName: string;
  embedding: EmbeddingVector;
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 * For normalized embeddings (which OpenAI returns), this is equivalent to dot product.
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Generate embeddings for a list of texts using OpenAI's API.
 * Handles batching automatically for large inputs.
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey?: string
): Promise<EmbeddingVector[]> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  if (texts.length === 0) return [];

  const allEmbeddings: EmbeddingVector[] = new Array(texts.length);

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Embeddings API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();

    // OpenAI returns embeddings sorted by index
    for (const item of data.data) {
      allEmbeddings[i + item.index] = item.embedding;
    }
  }

  return allEmbeddings;
}

/**
 * Generate embedding for a single text.
 */
export async function generateEmbedding(
  text: string,
  apiKey?: string
): Promise<EmbeddingVector> {
  const results = await generateEmbeddings([text], apiKey);
  return results[0];
}

/**
 * Find the best matching symptom from a list of embedded symptoms.
 * Returns the match with highest cosine similarity above the threshold.
 */
export function findBestMatch(
  queryEmbedding: EmbeddingVector,
  candidates: EmbeddedSymptom[],
  threshold: number = 0.4
): { symptom: EmbeddedSymptom; similarity: number } | null {
  let bestMatch: EmbeddedSymptom | null = null;
  let bestSimilarity = -1;

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(queryEmbedding, candidate.embedding);
    if (similarity > bestSimilarity && similarity >= threshold) {
      bestSimilarity = similarity;
      bestMatch = candidate;
    }
  }

  if (!bestMatch) return null;

  return { symptom: bestMatch, similarity: bestSimilarity };
}

/**
 * Classify a similarity score into a match type.
 * These thresholds are tuned for medical symptom matching with text-embedding-3-small.
 */
export function classifyMatch(
  similarity: number
): 'exact' | 'partial' | 'semantic' | null {
  if (similarity >= 0.85) return 'exact';    // near-identical meaning ("tachycardia" ↔ "rapid heart rate")
  if (similarity >= 0.68) return 'partial';  // clearly related ("brain fog" ↔ "cognitive dysfunction")
  if (similarity >= 0.50) return 'semantic'; // loosely related ("fatigue" ↔ "exercise intolerance")
  return null;                                // below threshold, not a meaningful match
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };

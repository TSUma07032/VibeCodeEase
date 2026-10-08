/**
 * Computes the cosine similarity between two vectors.
 * Returns a value between -1.0 and 1.0.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Computes the mean vector of a list of vectors.
 */
export function meanVector(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    
    const dim = vectors[0].length;
    const result = new Array(dim).fill(0);
    
    for (const vec of vectors) {
        if (vec.length !== dim) {
            throw new Error('All vectors must have the same dimension');
        }
        for (let i = 0; i < dim; i++) {
            result[i] += vec[i];
        }
    }
    
    for (let i = 0; i < dim; i++) {
        result[i] /= vectors.length;
    }
    
    return result;
}

/**
 * L2 normalizes a vector in-place.
 * Used mainly for local hashing embedding.
 */
export function normalizeInPlace(vec: number[]): void {
    let sumSq = 0;
    for (let i = 0; i < vec.length; i++) {
        sumSq += vec[i] * vec[i];
    }
    if (sumSq > 0) {
        const norm = Math.sqrt(sumSq);
        for (let i = 0; i < vec.length; i++) {
            vec[i] /= norm;
        }
    }
}

import { EmbeddingProvider } from './embeddingProvider';
import { normalizeInPlace } from '../vectorMath';

/**
 * Fallback embedding provider that computes a fixed-size vector based on character n-grams.
 * Very fast, no external API, works for Japanese.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
    public readonly providerId = 'local:hash-ngram-512';
    private readonly dim = 512;
    private readonly nGramSizes = [2, 3]; // bi-grams and tri-grams

    public async embedBatch(texts: string[]): Promise<number[][]> {
        return texts.map(text => this.embedSingle(text));
    }

    private embedSingle(text: string): number[] {
        const vec = new Array(this.dim).fill(0);
        const normalized = text.toLowerCase().replace(/\s+/g, '');
        
        if (normalized.length === 0) {
            return vec;
        }

        for (const n of this.nGramSizes) {
            for (let i = 0; i <= normalized.length - n; i++) {
                const ngram = normalized.substring(i, i + n);
                const hash = this.murmurHash3(ngram);
                const index = Math.abs(hash) % this.dim;
                vec[index] += 1;
            }
        }

        normalizeInPlace(vec);
        return vec;
    }

    /**
     * Simple 32-bit Murmur3-like hash for strings
     */
    private murmurHash3(str: string, seed: number = 0): number {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    }
}

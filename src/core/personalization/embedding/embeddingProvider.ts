export interface EmbeddingProvider {
    /**
     * Unique identifier for the embedding provider and model.
     * Used to detect when the provider has changed so embeddings can be recalculated.
     */
    readonly providerId: string;

    /**
     * Generates embeddings for a batch of text strings.
     */
    embedBatch(texts: string[]): Promise<number[][]>;
}

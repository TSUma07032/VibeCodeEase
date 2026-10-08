import { Candidate, PersonaWeights } from '../../types/personalization';
import { cosineSimilarity } from './vectorMath';

export interface RerankingConfig {
    alpha: number; // positive profile weight
    beta: number;  // negative profile weight
    gamma: number; // recent profile weight
    delta: number; // persona weight
}

export const DEFAULT_RERANKING_CONFIG: RerankingConfig = {
    alpha: 1.0,
    beta: 0.5,
    gamma: 0.3,
    delta: 0.2
};

export interface ScoredCandidate extends Candidate {
    score: number;
    metrics: {
        positiveScore: number;
        negativeScore: number;
        recentScore: number;
        personaScore: number;
    };
}

/**
 * Reranks candidates based on user preference profiles and current persona weights.
 * Pure function.
 */
export function rerankCandidates(
    candidates: Candidate[],
    positiveProfile: number[] | undefined,
    negativeProfile: number[] | undefined,
    recentProfile: number[] | undefined,
    personaWeights: PersonaWeights,
    config: RerankingConfig = DEFAULT_RERANKING_CONFIG
): ScoredCandidate[] {
    const validCandidates = candidates.filter(c => c.policyCompliant !== false && c.embedding && c.embedding.length > 0);
    
    // If we have no valid embeddings to rank, fallback to original order
    if (validCandidates.length === 0) {
        return candidates.map(c => ({
            ...c,
            score: 0,
            metrics: { positiveScore: 0, negativeScore: 0, recentScore: 0, personaScore: 0 }
        }));
    }

    const scored = validCandidates.map(candidate => {
        const emb = candidate.embedding!;
        
        const posScore = positiveProfile && positiveProfile.length === emb.length ? cosineSimilarity(emb, positiveProfile) : 0;
        const negScore = negativeProfile && negativeProfile.length === emb.length ? cosineSimilarity(emb, negativeProfile) : 0;
        const recScore = recentProfile && recentProfile.length === emb.length ? cosineSimilarity(emb, recentProfile) : 0;
        
        // Match candidate's persona with current dynamic persona weights
        const personaScore = personaWeights[candidate.persona] || 0;

        const score = 
            (config.alpha * posScore) - 
            (config.beta * negScore) + 
            (config.gamma * recScore) + 
            (config.delta * personaScore);

        return {
            ...candidate,
            score,
            metrics: {
                positiveScore: posScore,
                negativeScore: negScore,
                recentScore: recScore,
                personaScore
            }
        };
    });

    // Sort descending by score
    return scored.sort((a, b) => b.score - a.score);
}

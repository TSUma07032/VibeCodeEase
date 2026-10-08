import { PersonaId, PersonaMode, SituationId, PersonaWeights, ResponseRecord } from '../../types/personalization';
import { SITUATION_WEIGHTS } from './personaDefinitions';

export interface SelectorResult {
    weights: PersonaWeights;
    dominantPersona: PersonaId;
}

/**
 * Calculates current persona weights based on situation, learned history, and mode.
 * Pure function.
 */
export function determinePersonaWeights(
    situation: SituationId,
    mode: PersonaMode,
    records: ResponseRecord[],
    lambda: number = 0.6 // Weight for situation vs learned history
): SelectorResult {
    // 1. If mode is fixed to a specific persona, return 100% for that persona
    if (mode.startsWith('fixed:')) {
        const fixedId = mode.split(':')[1] as PersonaId;
        const weights: PersonaWeights = { exploration: 0, learning: 0, quality: 0 };
        if (fixedId in weights) {
            weights[fixedId] = 1.0;
            return { weights, dominantPersona: fixedId };
        }
    }

    // 2. Adaptive Mode (Persona E)
    const situationWeights = SITUATION_WEIGHTS[situation];
    
    // Filter records for this specific situation to learn situation-specific preferences
    const situationRecords = records.filter(r => r.situation === situation);
    
    // Calculate learned weights using Laplace smoothing
    const stats: Record<PersonaId, { adopt: number; reject: number }> = {
        exploration: { adopt: 0, reject: 0 },
        learning: { adopt: 0, reject: 0 },
        quality: { adopt: 0, reject: 0 }
    };

    for (const record of situationRecords) {
        if (record.persona in stats) {
            if (record.feedback === 'liked') stats[record.persona].adopt++;
            if (record.feedback === 'disliked') stats[record.persona].reject++;
        }
    }

    const learnedWeights: PersonaWeights = { exploration: 0, learning: 0, quality: 0 };
    let totalLearned = 0;

    for (const p of Object.keys(stats) as PersonaId[]) {
        // Laplace smoothing: (adopt + 1) / (adopt + reject + 2)
        const s = stats[p];
        const val = (s.adopt + 1) / (s.adopt + s.reject + 2);
        learnedWeights[p] = val;
        totalLearned += val;
    }

    // Normalize learned weights to sum to 1.0
    for (const p of Object.keys(learnedWeights) as PersonaId[]) {
        learnedWeights[p] /= totalLearned;
    }

    // Mix situation preset and learned history
    const finalWeights: PersonaWeights = { exploration: 0, learning: 0, quality: 0 };
    let maxWeight = -1;
    let dominant: PersonaId = 'exploration';

    for (const p of Object.keys(finalWeights) as PersonaId[]) {
        finalWeights[p] = (lambda * situationWeights[p]) + ((1 - lambda) * learnedWeights[p]);
        if (finalWeights[p] > maxWeight) {
            maxWeight = finalWeights[p];
            dominant = p;
        }
    }

    // Re-normalize final weights to ensure sum is 1.0
    let finalTotal = 0;
    for (const p of Object.keys(finalWeights) as PersonaId[]) {
        finalTotal += finalWeights[p];
    }
    for (const p of Object.keys(finalWeights) as PersonaId[]) {
        finalWeights[p] /= finalTotal;
    }

    return {
        weights: finalWeights,
        dominantPersona: dominant
    };
}

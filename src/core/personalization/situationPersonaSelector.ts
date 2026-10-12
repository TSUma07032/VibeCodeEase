import type {
    PersonaId,
    PersonaMode,
    PersonaWeights,
    ResponseRecord,
    SituationId,
} from '../../types/personalization';
import { SITUATION_WEIGHTS } from './personaDefinitions';

export interface SelectorResult {
    weights: PersonaWeights;
    dominantPersona: PersonaId;
}

export interface DeterminePersonaWeightsParams {
    situation: SituationId;
    mode: PersonaMode;
    records: ResponseRecord[];
    lambda?: number;
}

function getFixedPersona(mode: PersonaMode): SelectorResult | null {
    if (mode.startsWith('fixed:')) {
        const fixedId = mode.split(':')[1] as PersonaId;
        const weights: PersonaWeights = { exploration: 0, learning: 0, quality: 0 };
        if (fixedId in weights) {
            weights[fixedId] = 1.0;
            return { weights, dominantPersona: fixedId };
        }
    }
    return null;
}

function calculateLearnedWeights(
    records: ResponseRecord[],
    situation: SituationId,
): PersonaWeights {
    const stats: Record<PersonaId, { adopt: number; reject: number }> = {
        exploration: { adopt: 0, reject: 0 },
        learning: { adopt: 0, reject: 0 },
        quality: { adopt: 0, reject: 0 },
    };

    for (const record of records) {
        if (record.situation === situation && record.persona in stats) {
            if (record.feedback === 'liked') {
                stats[record.persona].adopt++;
            } else if (record.feedback === 'disliked') {
                stats[record.persona].reject++;
            }
        }
    }

    const learnedWeights: PersonaWeights = { exploration: 0, learning: 0, quality: 0 };
    let totalLearned = 0;
    for (const p of Object.keys(stats) as PersonaId[]) {
        const s = stats[p];
        const val = (s.adopt + 1) / (s.adopt + s.reject + 2);
        learnedWeights[p] = val;
        totalLearned += val;
    }

    for (const p of Object.keys(learnedWeights) as PersonaId[]) {
        learnedWeights[p] /= totalLearned;
    }
    return learnedWeights;
}

function mixAndNormalizeWeights(
    situationWeights: PersonaWeights,
    learnedWeights: PersonaWeights,
    lambda: number,
): SelectorResult {
    const finalWeights: PersonaWeights = { exploration: 0, learning: 0, quality: 0 };
    let maxWeight = -1;
    let dominant: PersonaId = 'exploration';

    for (const p of Object.keys(finalWeights) as PersonaId[]) {
        finalWeights[p] = lambda * situationWeights[p] + (1 - lambda) * learnedWeights[p];
        if (finalWeights[p] > maxWeight) {
            maxWeight = finalWeights[p];
            dominant = p;
        }
    }

    let finalTotal = 0;
    for (const p of Object.keys(finalWeights) as PersonaId[]) {
        finalTotal += finalWeights[p];
    }
    for (const p of Object.keys(finalWeights) as PersonaId[]) {
        finalWeights[p] /= finalTotal;
    }

    return { weights: finalWeights, dominantPersona: dominant };
}

/**
 * Calculates current persona weights based on situation, learned history, and mode.
 * Pure function.
 */
export function determinePersonaWeights({
    situation,
    mode,
    records,
    lambda = 0.6,
}: DeterminePersonaWeightsParams): SelectorResult {
    const fixed = getFixedPersona(mode);
    if (fixed) {
        return fixed;
    }

    const situationWeights = SITUATION_WEIGHTS[situation];
    const learnedWeights = calculateLearnedWeights(records, situation);
    return mixAndNormalizeWeights(situationWeights, learnedWeights, lambda);
}

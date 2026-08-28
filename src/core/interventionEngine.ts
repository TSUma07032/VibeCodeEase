import { InterventionLevel, PainCategory, UserPreferenceProfile } from '../types';
import { clampPreferenceValue } from '../types/utils';

export class InterventionEngine {
    /**
     * Determines the intervention level based on the user's preference for a specific pain category.
     * @param category The pain category to evaluate.
     * @param profile The user's preference profile containing values for each category.
     * @returns The determined InterventionLevel.
     */
    public static determineLevel(category: PainCategory, profile: UserPreferenceProfile): InterventionLevel {
        const rawValue = profile.preferences[category];
        const preferenceValue = clampPreferenceValue(rawValue, 0.5);

        // Thresholds:
        // > 0.8: Very bothersome -> SILENT (Automatic fix)
        // > 0.3: Bothersome -> SUGGESTION (Propose fix)
        // <= 0.3: Not bothersome / Fun -> IGNORE (Skip intervention)

        if (preferenceValue > 0.8) {
            return 'SILENT';
        } else if (preferenceValue > 0.3) {
            return 'SUGGESTION';
        } else {
            return 'IGNORE';
        }
    }
}

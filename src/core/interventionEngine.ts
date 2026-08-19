import { PainCategory, InterventionLevel, UserPreferenceProfile } from '../types';

export class InterventionEngine {
  /**
   * Threshold for SILENT intervention (e.g. 0.8)
   */
  private readonly silentThreshold: number;

  /**
   * Threshold for SUGGESTION intervention (e.g. 0.3)
   */
  private readonly suggestionThreshold: number;

  constructor(suggestionThreshold = 0.3, silentThreshold = 0.8) {
    this.suggestionThreshold = suggestionThreshold;
    this.silentThreshold = silentThreshold;
  }

  /**
   * Determine the intervention level based on the user's preference profile and pain category.
   *
   * @param category The category of the detected pain
   * @param profile The user's preference profile containing pain threshold values
   * @returns The determined InterventionLevel (SILENT, SUGGESTION, or IGNORE)
   */
  public determineLevel(category: PainCategory, profile: UserPreferenceProfile): InterventionLevel {
    const preferenceValue = profile.preferences[category];

    // Handle missing or invalid values by defaulting to a safe suggestion level if not provided
    const val = (typeof preferenceValue === 'number' && !isNaN(preferenceValue))
                ? preferenceValue
                : 0.5;

    if (val >= this.silentThreshold) {
      return 'SILENT';
    } else if (val >= this.suggestionThreshold) {
      return 'SUGGESTION';
    } else {
      return 'IGNORE';
    }
  }
}

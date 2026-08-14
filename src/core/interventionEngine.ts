import { AnalysisResult, InterventionLevel, PainCategory, UserPreferenceProfile } from '../types';

export class InterventionEngine {
  // Thresholds for deciding intervention level
  // value < 0.3: user finds it fun, no intervention
  private static readonly IGNORE_THRESHOLD = 0.3;
  // value >= 0.7: user finds it very bothersome, wants silent auto-fix
  private static readonly SILENT_THRESHOLD = 0.7;

  /**
   * Determines the intervention level based on user preference for a specific category.
   *
   * @param preference The user's preference profile containing values from 0.0 to 1.0
   * @param category The pain category to check
   * @returns The determined intervention level
   */
  public determineInterventionLevel(preference: UserPreferenceProfile, category: PainCategory): InterventionLevel {
    const value = preference.preferences[category];

    // Default to SUGGESTION if preference is not set
    if (value === undefined || value === null) {
      return 'SUGGESTION';
    }

    if (value < InterventionEngine.IGNORE_THRESHOLD) {
      return 'IGNORE';
    } else if (value >= InterventionEngine.SILENT_THRESHOLD) {
      return 'SILENT';
    } else {
      return 'SUGGESTION';
    }
  }

  /**
   * Processes a list of analysis results, updating their intervention levels based on user preferences.
   *
   * @param results The original analysis results
   * @param preference The user's preference profile
   * @returns A new array of analysis results with adjusted intervention levels
   */
  public processResults(results: AnalysisResult[], preference: UserPreferenceProfile): AnalysisResult[] {
    return results.map(result => {
      const adjustedLevel = this.determineInterventionLevel(preference, result.category);
      return {
        ...result,
        level: adjustedLevel
      };
    });
  }
}

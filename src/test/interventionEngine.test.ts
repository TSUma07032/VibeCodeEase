import * as assert from 'assert';
import { determineInterventionLevel, THRESHOLDS } from '../core/interventionEngine';
import { PainCategory, UserPreferenceProfile } from '../types';

suite('Intervention Engine Test Suite', () => {
    const defaultProfile: UserPreferenceProfile = {
        preferences: {
            'SYNTAX_TYPO': 0.5,
            'INDENTATION_FORMATTING': 0.5,
            'VAR_FUNC_MANAGEMENT': 0.5,
            'SYNTAX_ERROR_HANDLING': 0.5
        }
    };

    test('should return IGNORE when preference is below THRESHOLDS.IGNORE_MAX', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                ...defaultProfile.preferences,
                'SYNTAX_TYPO': THRESHOLDS.IGNORE_MAX - 0.1 // 0.2
            }
        };
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'IGNORE');
    });

    test('should return SUGGESTION when preference is exactly THRESHOLDS.IGNORE_MAX', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                ...defaultProfile.preferences,
                'SYNTAX_TYPO': THRESHOLDS.IGNORE_MAX // 0.3
            }
        };
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'SUGGESTION');
    });

    test('should return SUGGESTION when preference is exactly THRESHOLDS.SUGGESTION_MAX', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                ...defaultProfile.preferences,
                'SYNTAX_TYPO': THRESHOLDS.SUGGESTION_MAX // 0.7
            }
        };
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'SUGGESTION');
    });

    test('should return SILENT when preference is above THRESHOLDS.SUGGESTION_MAX', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                ...defaultProfile.preferences,
                'SYNTAX_TYPO': THRESHOLDS.SUGGESTION_MAX + 0.1 // 0.8
            }
        };
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'SILENT');
    });

    test('should return SUGGESTION for undefined category (fallback behavior)', () => {
        const profile: UserPreferenceProfile = {
            preferences: {} as any
        };
        // The default fallback in determineInterventionLevel is 0.5 which falls into SUGGESTION
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'SUGGESTION');
    });

    test('should return SUGGESTION for profile missing preferences object', () => {
        const profile = {} as UserPreferenceProfile;
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'SUGGESTION');
    });

    test('should clamp negative values and return IGNORE (clamped to 0.0)', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                ...defaultProfile.preferences,
                'SYNTAX_TYPO': -1.0
            }
        };
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'IGNORE');
    });

    test('should clamp values > 1.0 and return SILENT (clamped to 1.0)', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                ...defaultProfile.preferences,
                'SYNTAX_TYPO': 2.5
            }
        };
        const level = determineInterventionLevel('SYNTAX_TYPO', profile);
        assert.strictEqual(level, 'SILENT');
    });
});

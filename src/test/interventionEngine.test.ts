import * as assert from 'assert';
import { InterventionEngine } from '../core/interventionEngine';
import { UserPreferenceProfile } from '../types';

suite('InterventionEngine Test Suite', () => {
    test('should return SILENT for values > 0.8', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.81,
                'INDENTATION_FORMATTING': 1.0,
                'VAR_FUNC_MANAGEMENT': 0.5,
                'SYNTAX_ERROR_HANDLING': 0.5
            }
        };
        assert.strictEqual(InterventionEngine.determineLevel('SYNTAX_TYPO', profile), 'SILENT');
        assert.strictEqual(InterventionEngine.determineLevel('INDENTATION_FORMATTING', profile), 'SILENT');
    });

    test('should return SUGGESTION for values > 0.3 and <= 0.8', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.31,
                'INDENTATION_FORMATTING': 0.8,
                'VAR_FUNC_MANAGEMENT': 0.5,
                'SYNTAX_ERROR_HANDLING': 0.5
            }
        };
        assert.strictEqual(InterventionEngine.determineLevel('SYNTAX_TYPO', profile), 'SUGGESTION');
        assert.strictEqual(InterventionEngine.determineLevel('INDENTATION_FORMATTING', profile), 'SUGGESTION');
        assert.strictEqual(InterventionEngine.determineLevel('VAR_FUNC_MANAGEMENT', profile), 'SUGGESTION');
    });

    test('should return IGNORE for values <= 0.3', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.3,
                'INDENTATION_FORMATTING': 0.0,
                'VAR_FUNC_MANAGEMENT': 0.1,
                'SYNTAX_ERROR_HANDLING': 0.5
            }
        };
        assert.strictEqual(InterventionEngine.determineLevel('SYNTAX_TYPO', profile), 'IGNORE');
        assert.strictEqual(InterventionEngine.determineLevel('INDENTATION_FORMATTING', profile), 'IGNORE');
        assert.strictEqual(InterventionEngine.determineLevel('VAR_FUNC_MANAGEMENT', profile), 'IGNORE');
    });

    test('should handle invalid preference values using fallback (0.5 -> SUGGESTION)', () => {
        const profile: any = {
            preferences: {
                'SYNTAX_TYPO': undefined,
                'INDENTATION_FORMATTING': null,
                'VAR_FUNC_MANAGEMENT': NaN,
                'SYNTAX_ERROR_HANDLING': 'invalid'
            }
        };
        assert.strictEqual(InterventionEngine.determineLevel('SYNTAX_TYPO', profile), 'SUGGESTION');
        assert.strictEqual(InterventionEngine.determineLevel('INDENTATION_FORMATTING', profile), 'SUGGESTION');
        assert.strictEqual(InterventionEngine.determineLevel('VAR_FUNC_MANAGEMENT', profile), 'SUGGESTION');
        assert.strictEqual(InterventionEngine.determineLevel('SYNTAX_ERROR_HANDLING', profile), 'SUGGESTION');
    });
});

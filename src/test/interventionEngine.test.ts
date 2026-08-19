import * as assert from 'assert';
import { InterventionEngine } from '../core/interventionEngine';
import { UserPreferenceProfile, PainCategory } from '../types';

suite('InterventionEngine Test Suite', () => {
    let engine: InterventionEngine;

    setup(() => {
        engine = new InterventionEngine(0.3, 0.8);
    });

    test('should return IGNORE for values < 0.3', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.1,
                'INDENTATION_FORMATTING': 0.29,
                'VAR_FUNC_MANAGEMENT': 0.0,
                'SYNTAX_ERROR_HANDLING': 0.2
            }
        };

        assert.strictEqual(engine.determineLevel('SYNTAX_TYPO', profile), 'IGNORE');
        assert.strictEqual(engine.determineLevel('INDENTATION_FORMATTING', profile), 'IGNORE');
        assert.strictEqual(engine.determineLevel('VAR_FUNC_MANAGEMENT', profile), 'IGNORE');
    });

    test('should return SUGGESTION for values >= 0.3 and < 0.8', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.3,
                'INDENTATION_FORMATTING': 0.5,
                'VAR_FUNC_MANAGEMENT': 0.79,
                'SYNTAX_ERROR_HANDLING': 0.4
            }
        };

        assert.strictEqual(engine.determineLevel('SYNTAX_TYPO', profile), 'SUGGESTION');
        assert.strictEqual(engine.determineLevel('INDENTATION_FORMATTING', profile), 'SUGGESTION');
        assert.strictEqual(engine.determineLevel('VAR_FUNC_MANAGEMENT', profile), 'SUGGESTION');
    });

    test('should return SILENT for values >= 0.8', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.8,
                'INDENTATION_FORMATTING': 0.9,
                'VAR_FUNC_MANAGEMENT': 1.0,
                'SYNTAX_ERROR_HANDLING': 0.85
            }
        };

        assert.strictEqual(engine.determineLevel('SYNTAX_TYPO', profile), 'SILENT');
        assert.strictEqual(engine.determineLevel('INDENTATION_FORMATTING', profile), 'SILENT');
        assert.strictEqual(engine.determineLevel('VAR_FUNC_MANAGEMENT', profile), 'SILENT');
    });

    test('should handle missing values gracefully by defaulting to 0.5 (SUGGESTION)', () => {
        const profile: UserPreferenceProfile = {
            preferences: {} as Record<PainCategory, number>
        };

        assert.strictEqual(engine.determineLevel('SYNTAX_TYPO', profile), 'SUGGESTION');
    });

    test('should allow custom thresholds', () => {
        const customEngine = new InterventionEngine(0.5, 0.9);
        const profile: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.4,
                'INDENTATION_FORMATTING': 0.8,
                'VAR_FUNC_MANAGEMENT': 0.95,
                'SYNTAX_ERROR_HANDLING': 0.0
            }
        };

        assert.strictEqual(customEngine.determineLevel('SYNTAX_TYPO', profile), 'IGNORE');
        assert.strictEqual(customEngine.determineLevel('INDENTATION_FORMATTING', profile), 'SUGGESTION');
        assert.strictEqual(customEngine.determineLevel('VAR_FUNC_MANAGEMENT', profile), 'SILENT');
    });
});

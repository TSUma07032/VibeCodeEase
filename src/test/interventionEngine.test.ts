import * as assert from 'assert';
import { InterventionEngine } from '../core/interventionEngine';
import { UserPreferenceProfile, AnalysisResult } from '../types';

suite('InterventionEngine Test Suite', () => {
    let engine: InterventionEngine;

    setup(() => {
        engine = new InterventionEngine();
    });

    test('should return IGNORE when preference is < 0.3', () => {
        const preference: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.1,
                'INDENTATION_FORMATTING': 0.5,
                'VAR_FUNC_MANAGEMENT': 0.5,
                'SYNTAX_ERROR_HANDLING': 0.5
            }
        };

        const level = engine.determineInterventionLevel(preference, 'SYNTAX_TYPO');
        assert.strictEqual(level, 'IGNORE');
    });

    test('should return SILENT when preference is >= 0.7', () => {
        const preference: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.5,
                'INDENTATION_FORMATTING': 0.8,
                'VAR_FUNC_MANAGEMENT': 0.5,
                'SYNTAX_ERROR_HANDLING': 0.5
            }
        };

        const level = engine.determineInterventionLevel(preference, 'INDENTATION_FORMATTING');
        assert.strictEqual(level, 'SILENT');
    });

    test('should return SUGGESTION when preference is between 0.3 and 0.7', () => {
        const preference: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.5,
                'INDENTATION_FORMATTING': 0.5,
                'VAR_FUNC_MANAGEMENT': 0.4,
                'SYNTAX_ERROR_HANDLING': 0.5
            }
        };

        const level = engine.determineInterventionLevel(preference, 'VAR_FUNC_MANAGEMENT');
        assert.strictEqual(level, 'SUGGESTION');
    });

    test('should return SUGGESTION when preference is not set (undefined)', () => {
        const preference: UserPreferenceProfile = {
            preferences: {} as any // Simulate empty preferences
        };

        const level = engine.determineInterventionLevel(preference, 'SYNTAX_ERROR_HANDLING');
        assert.strictEqual(level, 'SUGGESTION');
    });

    test('processResults should update levels correctly for a list of results', () => {
        const preference: UserPreferenceProfile = {
            preferences: {
                'SYNTAX_TYPO': 0.2, // IGNORE
                'INDENTATION_FORMATTING': 0.9, // SILENT
                'VAR_FUNC_MANAGEMENT': 0.5, // SUGGESTION
                'SYNTAX_ERROR_HANDLING': 0.5 // SUGGESTION
            }
        };

        const results: AnalysisResult[] = [
            {
                category: 'SYNTAX_TYPO',
                level: 'SUGGESTION', // Original level
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                interventions: []
            },
            {
                category: 'INDENTATION_FORMATTING',
                level: 'SUGGESTION', // Original level
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                interventions: []
            }
        ];

        const updatedResults = engine.processResults(results, preference);

        assert.strictEqual(updatedResults.length, 2);
        assert.strictEqual(updatedResults[0].level, 'IGNORE');
        assert.strictEqual(updatedResults[1].level, 'SILENT');
    });
});

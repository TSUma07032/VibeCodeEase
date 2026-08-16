import * as assert from 'assert';
import { InterventionEngine } from '../../core/InterventionEngine';
import { UserPreferenceProfile, PainCategory } from '../../types';

suite('InterventionEngine Test Suite', () => {
  let engine: InterventionEngine;

  setup(() => {
    engine = new InterventionEngine();
  });

  test('determineInterventionLevel returns IGNORE for preference <= 0.3', () => {
    const profile: UserPreferenceProfile = {
      preferences: {
        'SYNTAX_TYPO': 0.2,
        'INDENTATION_FORMATTING': 0.3,
        'VAR_FUNC_MANAGEMENT': 0.0,
        'SYNTAX_ERROR_HANDLING': 0.5
      }
    };

    assert.strictEqual(engine.determineInterventionLevel('SYNTAX_TYPO', profile), 'IGNORE');
    assert.strictEqual(engine.determineInterventionLevel('INDENTATION_FORMATTING', profile), 'IGNORE');
    assert.strictEqual(engine.determineInterventionLevel('VAR_FUNC_MANAGEMENT', profile), 'IGNORE');
  });

  test('determineInterventionLevel returns SUGGESTION for 0.3 < preference < 0.7', () => {
    const profile: UserPreferenceProfile = {
      preferences: {
        'SYNTAX_TYPO': 0.4,
        'INDENTATION_FORMATTING': 0.6,
        'VAR_FUNC_MANAGEMENT': 0.5,
        'SYNTAX_ERROR_HANDLING': 0.31
      }
    };

    assert.strictEqual(engine.determineInterventionLevel('SYNTAX_TYPO', profile), 'SUGGESTION');
    assert.strictEqual(engine.determineInterventionLevel('INDENTATION_FORMATTING', profile), 'SUGGESTION');
    assert.strictEqual(engine.determineInterventionLevel('VAR_FUNC_MANAGEMENT', profile), 'SUGGESTION');
    assert.strictEqual(engine.determineInterventionLevel('SYNTAX_ERROR_HANDLING', profile), 'SUGGESTION');
  });

  test('determineInterventionLevel returns SILENT for preference >= 0.7', () => {
    const profile: UserPreferenceProfile = {
      preferences: {
        'SYNTAX_TYPO': 0.7,
        'INDENTATION_FORMATTING': 0.8,
        'VAR_FUNC_MANAGEMENT': 1.0,
        'SYNTAX_ERROR_HANDLING': 0.99
      }
    };

    assert.strictEqual(engine.determineInterventionLevel('SYNTAX_TYPO', profile), 'SILENT');
    assert.strictEqual(engine.determineInterventionLevel('INDENTATION_FORMATTING', profile), 'SILENT');
    assert.strictEqual(engine.determineInterventionLevel('VAR_FUNC_MANAGEMENT', profile), 'SILENT');
    assert.strictEqual(engine.determineInterventionLevel('SYNTAX_ERROR_HANDLING', profile), 'SILENT');
  });
});

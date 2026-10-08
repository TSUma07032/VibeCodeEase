import * as assert from 'assert';
import { InterventionEngine, determineInterventionLevel, INTERVENTION_THRESHOLDS, THRESHOLDS } from '../core/interventionEngine';
import { PRESET_DEFINITIONS, UserPreferenceProfile } from '../types';

suite('InterventionEngine Test Suite', () => {
    suite('determineLevel', () => {
        test('0.75莉･荳翫・ SILENT 繧定ｿ斐☆縺薙→', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.75), 'SILENT');
            assert.strictEqual(InterventionEngine.determineLevel(0.9), 'SILENT');
            assert.strictEqual(InterventionEngine.determineLevel(1.0), 'SILENT');
        });

        test('0.40莉･荳・.75譛ｪ貅縺ｯ SUGGESTION 繧定ｿ斐☆縺薙→', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.40), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.determineLevel(0.50), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.determineLevel(0.74), 'SUGGESTION');
        });

        test('0.40譛ｪ貅縺ｯ IGNORE 繧定ｿ斐☆縺薙→', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.39), 'IGNORE');
            assert.strictEqual(InterventionEngine.determineLevel(0.1), 'IGNORE');
            assert.strictEqual(InterventionEngine.determineLevel(0.0), 'IGNORE');
        });

        test('雋縺ｮ蛟､縺ｯ繧ｯ繝ｩ繝ｳ繝励＆繧・IGNORE 繧定ｿ斐☆縺薙→', () => {
            assert.strictEqual(InterventionEngine.determineLevel(-1.0), 'IGNORE');
        });

        test('1.0繧定ｶ・∴繧句､縺ｯ繧ｯ繝ｩ繝ｳ繝励＆繧・SILENT 繧定ｿ斐☆縺薙→', () => {
            assert.strictEqual(InterventionEngine.determineLevel(2.5), 'SILENT');
        });
    });

    suite('getLevelForCategory', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                SYNTAX_TYPO: 0.85,             // SILENT
                INDENTATION_FORMATTING: 0.5,  // SUGGESTION
                VAR_FUNC_MANAGEMENT: 0.2,     // IGNORE
                SYNTAX_ERROR_HANDLING: 0.4    // SUGGESTION
            }
        };

        test('蜷・き繝・ざ繝ｪ縺ｮ蝸懷･ｽ蛟､縺ｫ蠢懊§縺滉ｻ句・繝ｬ繝吶Ν繧貞愛螳壹〒縺阪ｋ縺薙→', () => {
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', profile), 'SILENT');
            assert.strictEqual(InterventionEngine.getLevelForCategory('INDENTATION_FORMATTING', profile), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.getLevelForCategory('VAR_FUNC_MANAGEMENT', profile), 'IGNORE');
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_ERROR_HANDLING', profile), 'SUGGESTION');
        });

        test('HINT繝励Μ繧ｻ繝・ヨ縺ｮ繧ｿ繧､繝昴・SILENT縲∬ｨｭ險医・讒区枚縺ｯ閾ｪ蜉・謠先｡医↓縺ｪ繧九％縺ｨ', () => {
            const HINTProfile: UserPreferenceProfile = {
                preferences: { ...PRESET_DEFINITIONS.HINT.preferences }
            };
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', HINTProfile), 'SILENT');
            assert.strictEqual(InterventionEngine.getLevelForCategory('VAR_FUNC_MANAGEMENT', HINTProfile), 'IGNORE');
        });

        test('譛ｪ螳夂ｾｩ繧ｫ繝・ざ繝ｪ繧・ｩｺ繝励Ο繝輔ぃ繧､繝ｫ縺ｯ繝・ヵ繧ｩ繝ｫ繝亥､(0.5 -> SUGGESTION)繧定ｿ斐☆縺薙→', () => {
            const emptyProfile = { preferences: {} } as any;
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', emptyProfile), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', undefined), 'SUGGESTION');
        });
    });

    suite('determineInterventionLevel (髢｢謨ｰ迚・', () => {
        const defaultProfile: UserPreferenceProfile = {
            preferences: {
                SYNTAX_TYPO: 0.5,
                INDENTATION_FORMATTING: 0.5,
                VAR_FUNC_MANAGEMENT: 0.5,
                SYNTAX_ERROR_HANDLING: 0.5
            }
        };

        test('縺励″縺・､譛ｪ貅縺ｯ IGNORE 繧定ｿ斐☆縺薙→', () => {
            const profile: UserPreferenceProfile = {
                preferences: {
                    ...defaultProfile.preferences,
                    SYNTAX_TYPO: THRESHOLDS.IGNORE_MAX - 0.1 // 0.3
                }
            };
            const level = determineInterventionLevel('SYNTAX_TYPO', profile);
            assert.strictEqual(level, 'IGNORE');
        });

        test('縺励″縺・､蠅・阜蛟､ (IGNORE_MAX) 縺ｧ縺ｯ SUGGESTION 繧定ｿ斐☆縺薙→', () => {
            const profile: UserPreferenceProfile = {
                preferences: {
                    ...defaultProfile.preferences,
                    SYNTAX_TYPO: THRESHOLDS.IGNORE_MAX // 0.4
                }
            };
            const level = determineInterventionLevel('SYNTAX_TYPO', profile);
            assert.strictEqual(level, 'SUGGESTION');
        });

        test('縺励″縺・､蠅・阜蛟､ (SUGGESTION_MAX) 縺ｧ縺ｯ SILENT 繧定ｿ斐☆縺薙→', () => {
            const profile: UserPreferenceProfile = {
                preferences: {
                    ...defaultProfile.preferences,
                    SYNTAX_TYPO: THRESHOLDS.SUGGESTION_MAX // 0.75
                }
            };
            const level = determineInterventionLevel('SYNTAX_TYPO', profile);
            assert.strictEqual(level, 'SILENT');
        });
    });

    suite('getEducationalHint', () => {
        test('HINT繝｢繝ｼ繝画凾縺ｫ謨呵ご逧・・繝ｬ繝輔ぅ繝・け繧ｹ縺ｨ隗｣隱ｬ縺悟性縺ｾ繧後ｋ縺薙→', () => {
            const hint = InterventionEngine.getEducationalHint('SYNTAX_TYPO', 'functon', 'function', 'HINT');
            assert.ok(hint.includes('雌 **蟄ｦ鄙偵ヲ繝ｳ繝・(繧ｿ繧､繝・:**'));
            assert.ok(hint.includes('functon'));
            assert.ok(hint.includes('function'));
        });

        test('HINT繝｢繝ｼ繝我ｻ･螟悶〒縺ｯ繧ｷ繝ｳ繝励Ν縺ｪ繧ｵ繧ｸ繧ｧ繧ｹ繝域枚繧定ｿ斐☆縺薙→', () => {
            const hint = InterventionEngine.getEducationalHint('SYNTAX_TYPO', 'functon', 'function', 'ARCHITECTURE');
            assert.strictEqual(hint, '庁 **Did you mean:** `function`?');
        });
    });
});

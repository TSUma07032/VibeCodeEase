import * as assert from 'assert';
import { InterventionEngine, determineInterventionLevel, INTERVENTION_THRESHOLDS, THRESHOLDS } from '../core/interventionEngine';
import { PRESET_DEFINITIONS, UserPreferenceProfile } from '../types';

suite('InterventionEngine Test Suite', () => {
    suite('determineLevel', () => {
        test('0.75以上は SILENT を返すこと', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.75), 'SILENT');
            assert.strictEqual(InterventionEngine.determineLevel(0.9), 'SILENT');
            assert.strictEqual(InterventionEngine.determineLevel(1.0), 'SILENT');
        });

        test('0.40以上0.75未満は SUGGESTION を返すこと', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.40), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.determineLevel(0.50), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.determineLevel(0.74), 'SUGGESTION');
        });

        test('0.40未満は IGNORE を返すこと', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.39), 'IGNORE');
            assert.strictEqual(InterventionEngine.determineLevel(0.1), 'IGNORE');
            assert.strictEqual(InterventionEngine.determineLevel(0.0), 'IGNORE');
        });

        test('負の値はクランプされ IGNORE を返すこと', () => {
            assert.strictEqual(InterventionEngine.determineLevel(-1.0), 'IGNORE');
        });

        test('1.0を超える値はクランプされ SILENT を返すこと', () => {
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

        test('各カテゴリの嗜好値に応じた介入レベルを判定できること', () => {
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', profile), 'SILENT');
            assert.strictEqual(InterventionEngine.getLevelForCategory('INDENTATION_FORMATTING', profile), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.getLevelForCategory('VAR_FUNC_MANAGEMENT', profile), 'IGNORE');
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_ERROR_HANDLING', profile), 'SUGGESTION');
        });

        test('LEARNINGプリセットのタイポはSILENT、設計・構文は自力/提案になること', () => {
            const learningProfile: UserPreferenceProfile = {
                preferences: { ...PRESET_DEFINITIONS.LEARNING.preferences }
            };
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', learningProfile), 'SILENT');
            assert.strictEqual(InterventionEngine.getLevelForCategory('VAR_FUNC_MANAGEMENT', learningProfile), 'IGNORE');
        });

        test('未定義カテゴリや空プロファイルはデフォルト値(0.5 -> SUGGESTION)を返すこと', () => {
            const emptyProfile = { preferences: {} } as any;
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', emptyProfile), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.getLevelForCategory('SYNTAX_TYPO', undefined), 'SUGGESTION');
        });
    });

    suite('determineInterventionLevel (関数版)', () => {
        const defaultProfile: UserPreferenceProfile = {
            preferences: {
                SYNTAX_TYPO: 0.5,
                INDENTATION_FORMATTING: 0.5,
                VAR_FUNC_MANAGEMENT: 0.5,
                SYNTAX_ERROR_HANDLING: 0.5
            }
        };

        test('しきい値未満は IGNORE を返すこと', () => {
            const profile: UserPreferenceProfile = {
                preferences: {
                    ...defaultProfile.preferences,
                    SYNTAX_TYPO: THRESHOLDS.IGNORE_MAX - 0.1 // 0.3
                }
            };
            const level = determineInterventionLevel('SYNTAX_TYPO', profile);
            assert.strictEqual(level, 'IGNORE');
        });

        test('しきい値境界値 (IGNORE_MAX) では SUGGESTION を返すこと', () => {
            const profile: UserPreferenceProfile = {
                preferences: {
                    ...defaultProfile.preferences,
                    SYNTAX_TYPO: THRESHOLDS.IGNORE_MAX // 0.4
                }
            };
            const level = determineInterventionLevel('SYNTAX_TYPO', profile);
            assert.strictEqual(level, 'SUGGESTION');
        });

        test('しきい値境界値 (SUGGESTION_MAX) では SILENT を返すこと', () => {
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
        test('LEARNINGモード時に教育的プレフィックスと解説が含まれること', () => {
            const hint = InterventionEngine.getEducationalHint('SYNTAX_TYPO', 'functon', 'function', 'LEARNING');
            assert.ok(hint.includes('🎓 **学習ヒント (タイポ):**'));
            assert.ok(hint.includes('functon'));
            assert.ok(hint.includes('function'));
        });

        test('LEARNINGモード以外ではシンプルなサジェスト文を返すこと', () => {
            const hint = InterventionEngine.getEducationalHint('SYNTAX_TYPO', 'functon', 'function', 'FLOW');
            assert.strictEqual(hint, '💡 **Did you mean:** `function`?');
        });
    });
});

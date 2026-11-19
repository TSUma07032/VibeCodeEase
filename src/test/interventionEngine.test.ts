import * as assert from 'node:assert';
import {
    determineInterventionLevel,
    InterventionEngine,
    THRESHOLDS,
} from '../core/interventionEngine';
import { PRESET_DEFINITIONS, type UserPreferenceProfile } from '../types';

function registerDetermineLevelTests(): void {
    suite('determineLevel', () => {
        test('0.75以上は SILENT を返すこと', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.75), 'SILENT');
            assert.strictEqual(InterventionEngine.determineLevel(0.9), 'SILENT');
            assert.strictEqual(InterventionEngine.determineLevel(1.0), 'SILENT');
        });

        test('0.40以上0.75未満は SUGGESTION を返すこと', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.4), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.determineLevel(0.5), 'SUGGESTION');
            assert.strictEqual(InterventionEngine.determineLevel(0.74), 'SUGGESTION');
        });

        test('0.40未満は IGNORE を返すこと', () => {
            assert.strictEqual(InterventionEngine.determineLevel(0.39), 'IGNORE');
            assert.strictEqual(InterventionEngine.determineLevel(0.1), 'IGNORE');
            assert.strictEqual(InterventionEngine.determineLevel(0.0), 'IGNORE');
        });

        test('範囲外の値は0.0〜1.0にクランプされること', () => {
            assert.strictEqual(InterventionEngine.determineLevel(-1.0), 'IGNORE');
            assert.strictEqual(InterventionEngine.determineLevel(2.5), 'SILENT');
        });
    });
}

function registerCategoryLevelTests(): void {
    suite('getLevelForCategory & determineInterventionLevel', () => {
        const profile: UserPreferenceProfile = {
            preferences: {
                SYNTAX_TYPO: 0.85,
                INDENTATION_FORMATTING: 0.5,
                VAR_FUNC_MANAGEMENT: 0.2,
                SYNTAX_ERROR_HANDLING: 0.4,
            },
        };

        test('各カテゴリの嗜好値に応じた介入レベルを判定できること', () => {
            assert.strictEqual(
                InterventionEngine.getLevelForCategory('SYNTAX_TYPO', profile),
                'SILENT',
            );
            assert.strictEqual(
                InterventionEngine.getLevelForCategory('INDENTATION_FORMATTING', profile),
                'SUGGESTION',
            );
            assert.strictEqual(
                InterventionEngine.getLevelForCategory('VAR_FUNC_MANAGEMENT', profile),
                'IGNORE',
            );
            assert.strictEqual(
                InterventionEngine.getLevelForCategory('SYNTAX_ERROR_HANDLING', profile),
                'SUGGESTION',
            );
        });

        test('HINTプリセットおよび未定義プロファイルの境界値を正しく判定すること', () => {
            const hintProfile: UserPreferenceProfile = {
                preferences: { ...PRESET_DEFINITIONS.HINT.preferences },
            };
            assert.strictEqual(
                InterventionEngine.getLevelForCategory('SYNTAX_TYPO', hintProfile),
                'SILENT',
            );
            assert.strictEqual(
                InterventionEngine.getLevelForCategory('VAR_FUNC_MANAGEMENT', hintProfile),
                'IGNORE',
            );
            assert.strictEqual(
                InterventionEngine.getLevelForCategory('SYNTAX_TYPO', undefined),
                'SUGGESTION',
            );
            assert.strictEqual(
                determineInterventionLevel('SYNTAX_TYPO', {
                    preferences: {
                        ...profile.preferences,
                        SYNTAX_TYPO: THRESHOLDS.IGNORE_MAX - 0.1,
                    },
                }),
                'IGNORE',
            );
            assert.strictEqual(
                determineInterventionLevel('SYNTAX_TYPO', {
                    preferences: { ...profile.preferences, SYNTAX_TYPO: THRESHOLDS.SUGGESTION_MAX },
                }),
                'SILENT',
            );
        });
    });
}

function registerEducationalHintTests(): void {
    suite('getEducationalHint', () => {
        test('HINTモード時に全カテゴリで教育的プレフィックスと解説が含まれること', () => {
            const typoHint = InterventionEngine.getEducationalHint({
                category: 'SYNTAX_TYPO',
                originalText: 'functon',
                replacementText: 'function',
                presetMode: 'HINT',
            });
            assert.ok(typoHint.includes('🎓 **学習ヒント (タイポ):**'));
            assert.ok(typoHint.includes('`functon`'));
            assert.ok(typoHint.includes('`function`'));

            const indentHint = InterventionEngine.getEducationalHint({
                category: 'INDENTATION_FORMATTING',
                originalText: '  ',
                replacementText: '',
                presetMode: 'HINT',
            });
            assert.ok(indentHint.includes('🎓 **学習ヒント (コード構造):**'));

            const varHint = InterventionEngine.getEducationalHint({
                category: 'VAR_FUNC_MANAGEMENT',
                originalText: 'var ',
                replacementText: 'const ',
                presetMode: 'HINT',
            });
            assert.ok(varHint.includes('🎓 **学習ヒント (命名・宣言):**'));

            const errHint = InterventionEngine.getEducationalHint({
                category: 'SYNTAX_ERROR_HANDLING',
                originalText: '{}',
                replacementText: '{ /* TODO */ }',
                presetMode: 'HINT',
            });
            assert.ok(errHint.includes('🎓 **学習ヒント (構文構造):**'));
        });

        test('HINTモード以外ではシンプルなサジェスト文を返すこと', () => {
            const hint = InterventionEngine.getEducationalHint({
                category: 'SYNTAX_TYPO',
                originalText: 'functon',
                replacementText: 'function',
                presetMode: 'ARCHITECTURE',
            });
            assert.strictEqual(hint, '💡 **Did you mean:** `function`?');
        });
    });
}

suite('InterventionEngine Test Suite', () => {
    registerDetermineLevelTests();
    registerCategoryLevelTests();
    registerEducationalHintTests();
});

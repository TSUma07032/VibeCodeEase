import * as assert from 'node:assert';
import {
    buildShadowPredictionPrompt,
    SHADOW_PREDICTION_SCHEMA,
} from '../../core/scaffolding/learningPromptBuilder';
import type { ShadowPredictionPromptInput } from '../../types/learningScaffolding';

suite('LearningPromptBuilder Test Suite', () => {
    test('buildShadowPredictionPrompt: 課題・目標・現在コード・Diagnosticsがプロンプトに埋め込まれること', () => {
        const input: ShadowPredictionPromptInput = {
            taskDescription: 'カウンターフックの作成',
            learningGoal: 'useEffectクリーンアップの理解',
            currentCode: 'function useCounter() { return 0; }',
            diagnostics: [
                { line: 5, severity: 'Error', message: 'Missing cleanup function' },
                { line: 8, severity: 'Error', message: 'Unused variable timer' },
            ],
        };

        const { systemInstruction, userPrompt } = buildShadowPredictionPrompt(input);

        // System Instruction 検証
        assert.ok(systemInstruction.includes('level1Perspective'));
        assert.ok(systemInstruction.includes('level2Concept'));
        assert.ok(systemInstruction.includes('level3SkeletonCode'));
        assert.ok(systemInstruction.includes('level4CompleteDiff'));
        assert.ok(systemInstruction.includes('isLearningGoalCore'));

        // User Prompt 検証 (複数Diagnosticsが改行結合されていること)
        assert.ok(userPrompt.includes('カウンターフックの作成'));
        assert.ok(userPrompt.includes('useEffectクリーンアップの理解'));
        assert.ok(userPrompt.includes('function useCounter()'));
        assert.ok(
            userPrompt.includes(
                'Line 5: [Error] Missing cleanup function\nLine 8: [Error] Unused variable timer',
            ),
        );
    });

    test('buildShadowPredictionPrompt: Diagnosticsが0件の場合は「なし (エラー0件)」と出力されること', () => {
        const input: ShadowPredictionPromptInput = {
            taskDescription: 'Task',
            learningGoal: 'Goal',
            currentCode: 'const x = 1;',
            diagnostics: [],
        };

        const { userPrompt } = buildShadowPredictionPrompt(input);
        assert.ok(userPrompt.includes('なし (エラー0件)'));
    });

    test('SHADOW_PREDICTION_SCHEMA: JSON Schemaのルートおよびmilestones/levelsの構造が定義されていること', () => {
        assert.strictEqual(SHADOW_PREDICTION_SCHEMA.type, 'object');
        assert.ok(SHADOW_PREDICTION_SCHEMA.required.includes('milestones'));
        assert.ok(SHADOW_PREDICTION_SCHEMA.required.includes('predictedCompleteCode'));
        assert.ok(SHADOW_PREDICTION_SCHEMA.required.includes('unresolvedKeyTasks'));
        assert.ok(SHADOW_PREDICTION_SCHEMA.required.includes('stagnationReasonHint'));
        assert.ok(SHADOW_PREDICTION_SCHEMA.required.includes('scaffoldingLevels'));

        // milestones items 検証
        const milestonesSchema = SHADOW_PREDICTION_SCHEMA.properties.milestones;
        assert.strictEqual(milestonesSchema.type, 'array');
        assert.ok(milestonesSchema.items.required.includes('id'));
        assert.ok(milestonesSchema.items.required.includes('title'));
        assert.ok(milestonesSchema.items.required.includes('weight'));
        assert.ok(milestonesSchema.items.required.includes('status'));
        assert.ok(milestonesSchema.items.required.includes('isLearningGoalCore'));
        assert.deepStrictEqual(milestonesSchema.items.properties.status.enum, [
            'COMPLETED',
            'IN_PROGRESS',
            'NOT_STARTED',
        ]);

        // scaffoldingLevels 検証
        const levelsSchema = SHADOW_PREDICTION_SCHEMA.properties.scaffoldingLevels;
        assert.ok(levelsSchema.required.includes('level1Perspective'));
        assert.ok(levelsSchema.required.includes('level2Concept'));
        assert.ok(levelsSchema.required.includes('level3SkeletonCode'));
        assert.ok(levelsSchema.required.includes('level4CompleteDiff'));
    });
});

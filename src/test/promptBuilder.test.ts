/**
 * [Why/Intent] PromptBuilder および介入プロンプト構築・20〜30字タイトル整形・ペルソナ別初手セリフの単体テストスイート。
 */
import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import {
    buildInterventionPrompt,
    formatInterventionOneLiner,
    formatPersonaSummary,
    getPersonaOpeningMessage,
    INTERVENTION_RESPONSE_SCHEMA,
    MAX_INTERVENTION_TITLE_LENGTH,
} from '../core/llm/promptBuilder';

suite('PromptBuilder Test Suite', () => {
    const mockDoc = {
        fileName: '/path/to/mySample.ts',
        languageId: 'typescript',
        getText: () => 'const greeting = "hello";',
    } as unknown as vscode.TextDocument;

    test('スキーマに必要なプロパティが定義されていること', () => {
        const schema = INTERVENTION_RESPONSE_SCHEMA;
        assert.strictEqual((schema as { type?: string }).type, 'object');
        assert.deepStrictEqual((schema as { required?: string[] }).required, ['summary', 'edits']);
        const serialized = JSON.stringify(schema);
        assert.strictEqual(serialized.includes('additionalProperties'), false);
        assert.strictEqual(serialized.includes('$schema'), false);
    });

    test('ドキュメント情報とコンテンツおよびコメントのみ修正禁止ルールを含むプロンプトが生成されること', () => {
        const prompt = buildInterventionPrompt(mockDoc);
        assert.ok(prompt.includes('File: /path/to/mySample.ts'));
        assert.ok(prompt.includes('Language: typescript'));
        assert.ok(prompt.includes('const greeting = "hello";'));
        assert.ok(prompt.includes('JSON schema:'));
        assert.ok(prompt.includes('PROHIBIT COMMENT-ONLY EDITS'));
        assert.ok(prompt.includes('NO DUPLICATE OR OVERLAPPING LOCATIONS'));
    });

    test('プリセットモード・ペルソナ・preferenceSummaryがプロンプトに反映され、機密ファイルは拒否されること', () => {
        const hintPrompt = buildInterventionPrompt(mockDoc, 'User prefers const over let.', {
            presetMode: 'HINT',
            personaId: 'tutor',
        });
        assert.ok(hintPrompt.includes('Never output comment-only edits'));
        assert.ok(hintPrompt.includes('User prefers const over let.'));
        assert.ok(hintPrompt.includes('Target selection (tutor)'));

        const bugPrompt = buildInterventionPrompt(mockDoc, undefined, {
            presetMode: 'BUG_TYPO',
            personaId: 'qa_security',
        });
        assert.ok(bugPrompt.includes('strictly focus on fixing typos'));
        assert.ok(bugPrompt.includes('Target selection (qa_security)'));

        const archPrompt = buildInterventionPrompt(mockDoc, undefined, {
            presetMode: 'ARCHITECTURE',
            personaId: 'architect',
        });
        assert.ok(archPrompt.includes('heavily focus on refactoring for better architecture'));
        assert.ok(archPrompt.includes('Target selection (architect)'));

        const envDoc = {
            fileName: '/path/to/.env',
            uri: { path: '/path/to/.env' },
            languageId: 'plaintext',
            getText: () => 'SECRET=1',
        } as unknown as vscode.TextDocument;
        assert.throws(() => buildInterventionPrompt(envDoc), /セキュリティエラー/);
    });

    test('formatInterventionOneLiner: カテゴリタグや絵文字を除去し30文字以内に収めること', () => {
        const raw =
            '[VAR_FUNC_MANAGEMENT] 🌲 **varは非推奨**: ブロックスコープを持つconstまたはletへの変更を強く推奨します';
        const formatted = formatInterventionOneLiner(raw);
        assert.ok(!formatted.includes('[VAR_FUNC_MANAGEMENT]'));
        assert.ok(formatted.length <= MAX_INTERVENTION_TITLE_LENGTH);
    });

    test('formatPersonaSummary & getPersonaOpeningMessage: ペルソナ別の変更理由と初手セリフが生成されること', () => {
        const mentorSummary = formatPersonaSummary('mentor', 'varをconstに変更します');
        const qaSummary = formatPersonaSummary('qa_security', '空のcatch節にエラー処理を追加');
        assert.ok(mentorSummary.includes('🌱'));
        assert.ok(qaSummary.includes('🛡️'));

        const mentorOpening = getPersonaOpeningMessage('mentor', 'varをconstに変更');
        const architectOpening = getPersonaOpeningMessage('architect', '責務の分離');
        assert.ok(mentorOpening.includes('やさしい解説メンター'));
        assert.ok(architectOpening.includes('設計・保守性'));
    });
});

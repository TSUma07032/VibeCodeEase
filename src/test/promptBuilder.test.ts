import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import { buildInterventionPrompt, INTERVENTION_RESPONSE_SCHEMA } from '../core/llm/promptBuilder';

suite('PromptBuilder Test Suite', () => {
    const mockDoc = {
        fileName: '/path/to/mySample.ts',
        languageId: 'typescript',
        getText: () => 'const greeting = "hello";',
    } as unknown as vscode.TextDocument;

    test('スキーマに必要なプロパティが定義されていること', () => {
        assert.strictEqual(INTERVENTION_RESPONSE_SCHEMA.type, 'OBJECT');
        assert.deepStrictEqual(INTERVENTION_RESPONSE_SCHEMA.required, ['summary', 'edits']);
    });

    test('ドキュメント情報とコンテンツを含むプロンプトが生成されること', () => {
        const prompt = buildInterventionPrompt(mockDoc);
        assert.ok(prompt.includes('File: /path/to/mySample.ts'));
        assert.ok(prompt.includes('Language: typescript'));
        assert.ok(prompt.includes('const greeting = "hello";'));
        assert.ok(prompt.includes('JSON schema:'));
    });

    test('プリセットモードおよびpreferenceSummaryがプロンプトに反映され、機密ファイルは拒否されること', () => {
        const hintPrompt = buildInterventionPrompt(mockDoc, 'User prefers const over let.', 'HINT');
        assert.ok(hintPrompt.includes('avoid writing the exact solution code'));
        assert.ok(hintPrompt.includes('User prefers const over let.'));

        const bugPrompt = buildInterventionPrompt(mockDoc, undefined, 'BUG_TYPO');
        assert.ok(bugPrompt.includes('strictly focus on fixing typos'));

        const archPrompt = buildInterventionPrompt(mockDoc, undefined, 'ARCHITECTURE');
        assert.ok(archPrompt.includes('heavily focus on refactoring for better architecture'));

        const envDoc = {
            fileName: '/path/to/.env',
            uri: { path: '/path/to/.env' },
            languageId: 'plaintext',
            getText: () => 'SECRET=1',
        } as unknown as vscode.TextDocument;
        assert.throws(() => buildInterventionPrompt(envDoc), /セキュリティエラー/);
    });
});

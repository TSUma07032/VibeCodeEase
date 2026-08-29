import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildInterventionPrompt, INTERVENTION_RESPONSE_SCHEMA } from '../core/llm/promptBuilder';

suite('PromptBuilder Test Suite', () => {
    test('スキーマに必要なプロパティが定義されていること', () => {
        assert.strictEqual(INTERVENTION_RESPONSE_SCHEMA.type, 'OBJECT');
        assert.deepStrictEqual(INTERVENTION_RESPONSE_SCHEMA.required, ['summary', 'edits']);
    });

    test('ドキュメント情報とコンテンツを含むプロンプトが生成されること', () => {
        const mockDoc = {
            fileName: '/path/to/mySample.ts',
            languageId: 'typescript',
            getText: () => 'const greeting = "hello";'
        } as unknown as vscode.TextDocument;

        const prompt = buildInterventionPrompt(mockDoc);
        assert.ok(prompt.includes('File: /path/to/mySample.ts'));
        assert.ok(prompt.includes('Language: typescript'));
        assert.ok(prompt.includes('const greeting = "hello";'));
        assert.ok(prompt.includes('JSON schema:'));
    });
});

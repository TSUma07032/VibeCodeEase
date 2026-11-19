import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ActionLogService } from '../core/actionLogService';
import { SharedAnalysisCache } from '../core/analyzer';
import { DiagnosticsService } from '../core/diagnosticsService';
import { InterventionManager } from '../core/interventionManager';
import { isSensitiveDocument, LlmInterventionService } from '../core/llmInterventionService';
import { SilentFixService } from '../core/silentFixService';
import { GlobalState } from '../state/globalState';
import type { AnalysisResult } from '../types';

function createMockDoc(
    text: string,
    fileName = '/workspace/sample.ts',
    version = 1,
): vscode.TextDocument {
    const lines = text.split(/\r?\n/);
    return {
        uri: vscode.Uri.file(fileName),
        fileName,
        languageId: 'typescript',
        version,
        lineCount: lines.length,
        getText: () => text,
    } as unknown as vscode.TextDocument;
}

function registerActionLogAndDiagnosticsTests(): void {
    test('ActionLogService が CSV インジェクション文字（改行・カンマ・ダブルクォート）をサニタイズして出力すること', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-log-'));
        const logger = new ActionLogService(tmpDir);

        logger.log({
            category: 'SYNTAX_TYPO\nINJECT,COL',
            action: 'APPLY',
            targetId: 'id-1',
            value: 1,
            payload: 'line1\n"quoted"',
        });

        const csvPath = path.join(tmpDir, 'research_action_log.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        assert.ok(csvContent.includes('SYNTAX_TYPO INJECT COL,APPLY,id-1,1,"line1\\n""quoted"""'));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('DiagnosticsService と InterventionManager が分類・破棄・キャッシュ無効化を行うこと', () => {
        const diagService = new DiagnosticsService();
        const typoDiag = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 5),
            "Spelling mistake. Did you mean 'function'?",
            vscode.DiagnosticSeverity.Warning,
        );
        assert.strictEqual(diagService.categorizeDiagnostic(typoDiag), 'SYNTAX_TYPO');

        const unusedDiag = new vscode.Diagnostic(
            new vscode.Range(1, 0, 1, 5),
            "'x' is declared but its value is never used.",
            vscode.DiagnosticSeverity.Warning,
        );
        assert.strictEqual(diagService.categorizeDiagnostic(unusedDiag), 'VAR_FUNC_MANAGEMENT');

        const doc = createMockDoc('functon a() {}\nconst x = 1;');
        const result: AnalysisResult = {
            category: 'SYNTAX_TYPO',
            level: 'SUGGESTION',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
            interventions: [
                { message: 'Typo', originalText: 'functon', replacementText: 'function' },
            ],
        };
        const id = InterventionManager.generateIssueId(doc.uri.toString(), result);
        assert.ok(id.includes('SYNTAX_TYPO'));
        InterventionManager.discardIntervention(id);
        diagService.dispose();
    });
}

function registerSilentFixTests(): void {
    test('SilentFixService が SILENT レベルの末尾スペース削除（空文字置換）を正しく適用すること', async () => {
        GlobalState.resetInstanceForTesting();
        const state = GlobalState.getInstance();
        await state.updatePreference('INDENTATION_FORMATTING', 0.9); // SILENT

        const silentFix = new SilentFixService();
        const doc = createMockDoc('const x = 1;   ', '/workspace/trailing.ts', 1);
        SharedAnalysisCache.getInstance().getResults(doc);

        let editsPromise: Promise<vscode.TextEdit[]> | undefined;
        const event = {
            document: doc,
            reason: vscode.TextDocumentSaveReason.Manual,
            waitUntil: (thenable: Thenable<vscode.TextEdit[]>) => {
                editsPromise = Promise.resolve(thenable);
            },
        };

        (silentFix as unknown as { handleWillSave: (e: unknown) => void }).handleWillSave(event);
        assert.ok(editsPromise, 'waitUntil が呼ばれること');
        const edits = await editsPromise;
        assert.strictEqual(edits.length, 1);
        assert.strictEqual(edits[0].newText, '');
        silentFix.dispose();
        GlobalState.resetInstanceForTesting();
    });
}

function registerLlmInterventionTests(): void {
    test('isSensitiveDocument が機密ファイル(.env, .pem, .key等)を検出し通常の.tsを許可すること', () => {
        assert.strictEqual(isSensitiveDocument(createMockDoc('KEY=1', '/app/.env')), true);
        assert.strictEqual(isSensitiveDocument(createMockDoc('KEY=1', '/app/.env.local')), true);
        assert.strictEqual(isSensitiveDocument(createMockDoc('CERT', '/app/cert.pem')), true);
        assert.strictEqual(
            isSensitiveDocument(createMockDoc('const a = 1;', '/app/main.ts')),
            false,
        );
    });

    test('LlmInterventionService が機密ファイルを拒否し、SecretStorage のキーを優先して構造化出力を取得すること', async () => {
        const mockGemini = {
            generate: (opts: { apiKey: string }) => Promise.resolve({ usedKey: opts.apiKey }),
        };
        const mockSecrets = {
            get: (key: string) =>
                Promise.resolve(
                    key === 'vibecodeease.geminiApiKey' ? 'secret-storage-key' : undefined,
                ),
        } as unknown as vscode.SecretStorage;
        const service = new LlmInterventionService(mockGemini as never, undefined, mockSecrets);

        const tokenSource = new vscode.CancellationTokenSource();
        await assert.rejects(
            () =>
                service.createGeminiPlan({
                    document: createMockDoc('SECRET=1', '/app/.env'),
                    token: tokenSource.token,
                    apiKey: 'secret-storage-key',
                }),
            /セキュリティ違反/,
        );

        const jsonStr = await service.requestStructuredOutput({
            systemInstruction: 'sys',
            userPrompt: 'user',
            responseSchema: { type: 'OBJECT' },
        });
        assert.strictEqual(jsonStr, '{"usedKey":"secret-storage-key"}');
        tokenSource.dispose();
    });
}

suite('Core Services Test Suite', () => {
    registerActionLogAndDiagnosticsTests();
    registerSilentFixTests();
    registerLlmInterventionTests();
});

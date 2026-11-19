import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import { getNonce } from '../vscode-utils/getNonce';
import { VibeStatusBar } from '../vscode-utils/StatusBar';
import {
    fetchSideEditorSettings,
    mapAiLevelToPreset,
    saveLlmConfigSettings,
} from '../vscode-utils/sideEditorConfig';
import { getSideEditorHtml } from '../vscode-utils/sideEditorHtml';

suite('Extension Utilities & GlobalState Test Suite', () => {
    test('GlobalState のシングルトンとプリセット・LLM設定変更が正しく機能すること', async () => {
        GlobalState.resetInstanceForTesting();
        const state = GlobalState.getInstance();
        let eventCount = 0;
        const sub = state.onDidChangeState(() => {
            eventCount++;
        });

        await state.setPresetMode('HINT');
        assert.strictEqual(state.presetMode, 'HINT');
        assert.strictEqual(state.preferences.preferences.SYNTAX_TYPO, 0.8);
        assert.strictEqual(state.getInterventionLevel('SYNTAX_TYPO'), 'SILENT');

        await state.updatePreference('VAR_FUNC_MANAGEMENT', 1.5);
        assert.strictEqual(state.preferences.preferences.VAR_FUNC_MANAGEMENT, 1.0);
        await state.updatePreference('VAR_FUNC_MANAGEMENT', -0.5);
        assert.strictEqual(state.preferences.preferences.VAR_FUNC_MANAGEMENT, 0.0);

        await state.setLlmTriggerMode('on-save');
        await state.setEditorAppealLevel('low');
        assert.strictEqual(state.llmTriggerMode, 'on-save');
        assert.strictEqual(state.editorAppealLevel, 'low');

        assert.ok(eventCount >= 4);
        sub.dispose();
        GlobalState.resetInstanceForTesting();
    });

    test('getNonce と getSideEditorHtml が CSP および nonce 属性を含む安全な HTML を生成すること', () => {
        const nonce = getNonce();
        assert.strictEqual(nonce.length, 32);
        assert.match(nonce, /^[A-Za-z0-9]{32}$/);

        const mockWebview = {
            cspSource: 'vscode-webview://test-source',
            asWebviewUri: (uri: vscode.Uri) => uri,
        } as unknown as vscode.Webview;

        const html = getSideEditorHtml(mockWebview, vscode.Uri.file('/ext'));
        assert.ok(html.includes('Content-Security-Policy'));
        assert.ok(html.includes('vscode-webview://test-source'));
        assert.ok(html.includes('<script nonce="'));
    });

    test('mapAiLevelToPreset と fetchSideEditorSettings / saveLlmConfigSettings が正しく動作すること', async () => {
        assert.strictEqual(mapAiLevelToPreset('Level 1 (Typo/Bug Fix)'), 'BUG_TYPO');
        assert.strictEqual(mapAiLevelToPreset('Level 2 (Refactoring)'), 'HINT');
        assert.strictEqual(
            mapAiLevelToPreset('Level 3 (Architecture Optimization)'),
            'ARCHITECTURE',
        );

        const mockContext = {
            secrets: { get: () => Promise.resolve('test-secret-key') },
        } as unknown as vscode.ExtensionContext;
        const settings = await fetchSideEditorSettings(mockContext);
        assert.strictEqual(settings.apiKey, 'test-secret-key');

        const updatedValues: Record<string, unknown> = {};
        const origGetConfig = vscode.workspace.getConfiguration;
        (vscode.workspace as unknown as { getConfiguration: unknown }).getConfiguration = () => ({
            get: (_k: string, def: unknown) => def,
            update: (key: string, val: unknown) => {
                updatedValues[key] = val;
                return Promise.resolve();
            },
        });
        try {
            await saveLlmConfigSettings(1, 'interval', 'gemini-3.5-flash-lite');
            assert.strictEqual(updatedValues['llm.syncIntervalSeconds'], 5);
            await saveLlmConfigSettings(9999, 'onSave', 'gemini-2.5-pro');
            assert.strictEqual(updatedValues['llm.syncIntervalSeconds'], 3600);
        } finally {
            (vscode.workspace as unknown as { getConfiguration: unknown }).getConfiguration =
                origGetConfig;
        }
    });

    test('VibeStatusBar の各プリセット状態遷移と dispose が例外なく動作すること', async () => {
        const statusBar = new VibeStatusBar();
        const state = GlobalState.getInstance();
        await state.setPresetMode('HINT');
        await state.setPresetMode('ARCHITECTURE');
        await state.setPresetMode('BUG_TYPO');
        await state.updatePreference('SYNTAX_TYPO', 0.8);
        statusBar.updateState();
        statusBar.dispose();
        GlobalState.resetInstanceForTesting();
    });
});

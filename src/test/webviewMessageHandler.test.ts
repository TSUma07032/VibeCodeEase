import * as assert from 'assert';
import * as vscode from 'vscode';
import { WebviewMessageHandler } from '../vscode-utils/WebviewMessageHandler';
import { GlobalState } from '../state/globalState';

suite('WebviewMessageHandler Test Suite', () => {
    let messageHandler: WebviewMessageHandler;
    let mockWebview: any;
    let mockSecrets: any;
    let postedMessages: any[] = [];

    setup(() => {
        postedMessages = [];
        mockWebview = {
            postMessage: (message: any) => {
                postedMessages.push(message);
                return Promise.resolve(true);
            },
            options: {},
            html: '',
            onDidReceiveMessage: new vscode.EventEmitter<any>().event,
            asWebviewUri: (uri: vscode.Uri) => uri,
            cspSource: ''
        };

        mockSecrets = {
            get: () => Promise.resolve('test-key'),
            store: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
        };

        messageHandler = new WebviewMessageHandler(mockSecrets as any);

        // モックされたcontextでGlobalStateを初期化する
        const mockContext: any = {
            globalState: {
                get: (key: string) => undefined,
                update: (key: string, value: any) => Promise.resolve()
            }
        };
        GlobalState.getInstance().initialize(mockContext);
    });

    teardown(() => {
        // Reset GlobalState instance for other tests if needed
        const state = GlobalState.getInstance() as any;
        state._preferences = { preferences: {} };
    });

    test('should ignore non-object payloads', async () => {
        await messageHandler.handleMessage('string payload', mockWebview);
        await messageHandler.handleMessage(123, mockWebview);
        await messageHandler.handleMessage(null, mockWebview);
        assert.strictEqual(postedMessages.length, 0);
    });

    test('should ignore payloads without command string', async () => {
        await messageHandler.handleMessage({ data: 'no command' }, mockWebview);
        await messageHandler.handleMessage({ command: 123 }, mockWebview);
        assert.strictEqual(postedMessages.length, 0);
    });

    test('should safely ignore unknown commands', async () => {
        await messageHandler.handleMessage({ command: 'UNKNOWN_COMMAND' }, mockWebview);
        assert.strictEqual(postedMessages.length, 0);
    });

    test('should update preference value if valid', async () => {
        const data = {
            command: 'UPDATE_PREFERENCE_VALUE',
            payload: { category: 'SYNTAX_TYPO', value: 0.5 }
        };

        await messageHandler.handleMessage(data, mockWebview);

        // 成功すると sendCurrentSettings が呼ばれて設定データがポストされるはず
        assert.strictEqual(postedMessages.length, 1);
        assert.strictEqual(postedMessages[0].type, 'SETTINGS_DATA');
        // モック上で実際に更新されているか確認
        assert.strictEqual(postedMessages[0].payload.preferences['SYNTAX_TYPO'], 0.5);
    });

    test('should ignore update preference if value is out of bounds or invalid', async () => {
        // valueがない
        await messageHandler.handleMessage({
            command: 'UPDATE_PREFERENCE_VALUE',
            payload: { category: 'SYNTAX_TYPO' }
        }, mockWebview);
        assert.strictEqual(postedMessages.length, 0);

        // categoryが文字列じゃない
        await messageHandler.handleMessage({
            command: 'UPDATE_PREFERENCE_VALUE',
            payload: { category: 123, value: 0.5 }
        }, mockWebview);
        assert.strictEqual(postedMessages.length, 0);
    });

    test('should handle UPDATE_PREFERENCE correctly', async () => {
        // Just verify it doesn't crash since it interacts with vscode.window
        await messageHandler.handleMessage({
            command: 'UPDATE_PREFERENCE',
            payload: 'Test Message'
        }, mockWebview);
        // It calls setStatusBarMessage under the hood, but doesn't send message back to webview
        assert.strictEqual(postedMessages.length, 0);
    });

    test('should handle SET_PRESET with valid and invalid preset', async () => {
        // Valid preset
        await messageHandler.handleMessage({
            command: 'SET_PRESET',
            payload: 'FLOW'
        }, mockWebview);
        assert.strictEqual(postedMessages.length, 1);
        assert.strictEqual(postedMessages[0].payload.presetMode, 'FLOW');

        postedMessages = [];

        // Invalid preset should be ignored
        await messageHandler.handleMessage({
            command: 'SET_PRESET',
            payload: 'INVALID_PRESET'
        }, mockWebview);
        assert.strictEqual(postedMessages.length, 0);
    });

    test('should handle SET_LLM_CONFIG correctly', async () => {
        await messageHandler.handleMessage({
            command: 'SET_LLM_CONFIG',
            payload: { provider: 'vscode-lm', model: 'gpt-4o' }
        }, mockWebview);
        assert.strictEqual(postedMessages.length, 1);
        assert.strictEqual(postedMessages[0].payload.llmConfig.provider, 'vscode-lm');
        assert.strictEqual(postedMessages[0].payload.llmConfig.model, 'gpt-4o');
    });

    test('should handle SAVE_API_KEY and DELETE_API_KEY correctly', async () => {
        let storedKey = '';
        mockSecrets.store = (key: string, val: string) => { storedKey = val; return Promise.resolve(); };
        mockSecrets.delete = (key: string) => { storedKey = ''; return Promise.resolve(); };
        mockSecrets.get = (key: string) => Promise.resolve(storedKey || undefined);

        await messageHandler.handleMessage({
            command: 'SAVE_API_KEY',
            payload: { apiKey: 'test-key' }
        }, mockWebview);
        assert.strictEqual(storedKey, 'test-key');
        assert.strictEqual(postedMessages.length, 1);
        assert.strictEqual(postedMessages[0].payload.hasGeminiApiKey, true);

        postedMessages = [];

        await messageHandler.handleMessage({
            command: 'DELETE_API_KEY'
        }, mockWebview);
        assert.strictEqual(storedKey, '');
        assert.strictEqual(postedMessages.length, 1);
        assert.strictEqual(postedMessages[0].payload.hasGeminiApiKey, false);
    });


    test('should trigger actionCallback with REJECT on REJECT_PLAN', async () => {
        let callbackAction: string | undefined;
        messageHandler.setActionCallback((action) => {
            callbackAction = action;
        });

        // pendingPlan を手動セット
        (messageHandler as any).pendingPlan = {
            documentUri: 'file:///dummy.ts',
            documentVersion: 1,
            plan: { summary: 'test plan', edits: [] }
        };

        await messageHandler.handleMessage({
            command: 'REJECT_PLAN'
        }, mockWebview);

        assert.strictEqual(callbackAction, 'REJECT');
        assert.strictEqual(postedMessages.length, 1);
        assert.strictEqual(postedMessages[0].type, 'PLAN_REJECTED');
        assert.strictEqual(messageHandler.getPendingPlan(), undefined);
    });
});

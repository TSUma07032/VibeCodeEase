/**
 * [Why/Intent] SideEditorProvider における双方向スクロール同期機能
 * （作業エディタ → サイドバー / サイドバー → 作業エディタ / ループ抑止ロック / 設定ON・OFF切替）
 * を検証する結合テストスイート。
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import { SideEditorProvider } from '../vscode-utils/SideEditorProvider';
import { computeEditorLineHeight } from '../vscode-utils/sideEditorConfig';

class MockMemento implements vscode.Memento {
    private readonly storage = new Map<string, unknown>();
    public keys(): readonly string[] {
        return Array.from(this.storage.keys());
    }
    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.storage.get(key) as T) ?? defaultValue;
    }
    public update(key: string, value: unknown): Thenable<void> {
        if (value === undefined) {
            this.storage.delete(key);
        } else {
            this.storage.set(key, value);
        }
        return Promise.resolve();
    }
}

class MockSecretStorage implements vscode.SecretStorage {
    private readonly secrets = new Map<string, string>();
    private readonly onDidChangeEmitter =
        new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    public get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this.secrets.get(key));
    }
    public keys(): Thenable<string[]> {
        return Promise.resolve(Array.from(this.secrets.keys()));
    }
    public store(key: string, value: string): Thenable<void> {
        this.secrets.set(key, value);
        return Promise.resolve();
    }
    public delete(key: string): Thenable<void> {
        this.secrets.delete(key);
        return Promise.resolve();
    }
    public dispose(): void {
        this.onDidChangeEmitter.dispose();
    }
}

interface ScrollSyncHarness {
    provider: SideEditorProvider;
    mockEditor: vscode.TextEditor;
    visibleRangesEmitter: vscode.EventEmitter<vscode.TextEditorVisibleRangesChangeEvent>;
    postedMessages: unknown[];
    revealedCalls: Array<{ range: vscode.Range; revealType?: vscode.TextEditorRevealType }>;
    getReceiveListener: () => ((msg: unknown) => Promise<void>) | undefined;
    getScrollSyncSetting: () => boolean;
    restore: () => void;
}

function createScrollSyncHarness(): ScrollSyncHarness {
    SideEditorProvider.resetInstanceForTesting();
    const postedMessages: unknown[] = [];
    const revealedCalls: Array<{ range: vscode.Range; revealType?: vscode.TextEditorRevealType }> =
        [];
    let receiveListener: ((msg: unknown) => Promise<void>) | undefined;
    let disposeListener: (() => void) | undefined;
    let scrollSyncSetting = true;
    const visibleRangesEmitter =
        new vscode.EventEmitter<vscode.TextEditorVisibleRangesChangeEvent>();

    const docUri = vscode.Uri.file('/mock/workspace/sample.ts');
    const mockEditor = {
        document: {
            uri: docUri,
            fileName: '/mock/workspace/sample.ts',
            lineCount: 100,
            getText: () => Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'),
        },
        viewColumn: vscode.ViewColumn.One,
        visibleRanges: [new vscode.Range(0, 0, 20, 0)],
        revealRange: (range: vscode.Range, revealType?: vscode.TextEditorRevealType) => {
            revealedCalls.push({ range, revealType });
        },
    } as unknown as vscode.TextEditor;

    const mockContext = {
        workspaceState: new MockMemento(),
        globalState: new MockMemento() as unknown as vscode.Memento & { setKeysForSync(): void },
        secrets: new MockSecretStorage(),
        extensionUri: vscode.Uri.file('/mock/extension'),
        subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    const mockLlmService = {
        onDidUpdateDashboard: new vscode.EventEmitter<unknown>(),
        pause: () => {},
        resume: () => {},
        startTimerIfConfigured: () => {},
        getDashboardState: () => ({ status: 'idle', response: null, logs: [] }),
    } as unknown as LlmBackgroundService;

    const origCreatePanel = vscode.window.createWebviewPanel;
    const origOnVisibleRanges = vscode.window.onDidChangeTextEditorVisibleRanges;
    const origVisibleDesc = Object.getOwnPropertyDescriptor(vscode.window, 'visibleTextEditors');
    const origActiveDesc = Object.getOwnPropertyDescriptor(vscode.window, 'activeTextEditor');
    const origGetConfig = vscode.workspace.getConfiguration;

    (vscode.window as { createWebviewPanel: unknown }).createWebviewPanel = () =>
        ({
            webview: {
                html: '',
                cspSource: 'vscode-webview://test',
                asWebviewUri: (uri: vscode.Uri) => uri,
                postMessage: (msg: unknown) => {
                    postedMessages.push(msg);
                    return Promise.resolve(true);
                },
                onDidReceiveMessage: (listener: (msg: unknown) => Promise<void>) => {
                    receiveListener = listener;
                    return { dispose: () => {} };
                },
            },
            reveal: () => {},
            onDidDispose: (listener: () => void) => {
                disposeListener = listener;
                return { dispose: () => {} };
            },
            dispose: () => {
                disposeListener?.();
            },
        }) as unknown as vscode.WebviewPanel;

    (
        vscode.window as { onDidChangeTextEditorVisibleRanges: unknown }
    ).onDidChangeTextEditorVisibleRanges = visibleRangesEmitter.event;
    Object.defineProperty(vscode.window, 'visibleTextEditors', {
        configurable: true,
        get: () => [mockEditor],
    });
    Object.defineProperty(vscode.window, 'activeTextEditor', {
        configurable: true,
        get: () => undefined,
    });
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration = () =>
        ({
            get: (key: string, defaultValue?: unknown) =>
                key === 'scrollSync' ? scrollSyncSetting : defaultValue,
            update: (key: string, value: unknown) => {
                if (key === 'scrollSync' && typeof value === 'boolean') {
                    scrollSyncSetting = value;
                }
                return Promise.resolve();
            },
        }) as unknown as vscode.WorkspaceConfiguration;

    const provider = SideEditorProvider.getInstance(mockContext, mockLlmService);
    return {
        provider,
        mockEditor,
        visibleRangesEmitter,
        postedMessages,
        revealedCalls,
        getReceiveListener: () => receiveListener,
        getScrollSyncSetting: () => scrollSyncSetting,
        restore: () => {
            SideEditorProvider.resetInstanceForTesting();
            visibleRangesEmitter.dispose();
            (vscode.window as { createWebviewPanel: typeof origCreatePanel }).createWebviewPanel =
                origCreatePanel;
            (
                vscode.window as {
                    onDidChangeTextEditorVisibleRanges: typeof origOnVisibleRanges;
                }
            ).onDidChangeTextEditorVisibleRanges = origOnVisibleRanges;
            if (origVisibleDesc) {
                Object.defineProperty(vscode.window, 'visibleTextEditors', origVisibleDesc);
            }
            if (origActiveDesc) {
                Object.defineProperty(vscode.window, 'activeTextEditor', origActiveDesc);
            }
            (vscode.workspace as { getConfiguration: typeof origGetConfig }).getConfiguration =
                origGetConfig;
        },
    };
}

suite('SideEditorProvider Scroll Sync Integration Test Suite', () => {
    let harness: ScrollSyncHarness;

    setup(() => {
        harness = createScrollSyncHarness();
    });

    teardown(() => {
        harness.restore();
    });

    test('作業エディタをスクロールするとサイドバーへ SYNC_EDITOR_SCROLL が送信されること', async () => {
        await harness.provider.openSideEditor();
        harness.postedMessages.length = 0;

        harness.visibleRangesEmitter.fire({
            textEditor: harness.mockEditor,
            visibleRanges: [new vscode.Range(24, 0, 44, 0)],
        });

        const scrollMsg = harness.postedMessages.find(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                (m as { type?: string }).type === 'SYNC_EDITOR_SCROLL',
        ) as { type: string; topLine: number } | undefined;

        assert.ok(scrollMsg, 'SYNC_EDITOR_SCROLL が送信されていること');
        assert.strictEqual(scrollMsg.topLine, 24);
    });

    test('サイドバーから SYNC_WEBVIEW_SCROLL を受信すると左エディタが revealRange(AtTop) でスクロールされ、直後のエコーバックは抑止されること', async () => {
        await harness.provider.openSideEditor();
        harness.postedMessages.length = 0;
        const listener = harness.getReceiveListener();
        assert.ok(listener);

        await listener({
            type: 'SYNC_WEBVIEW_SCROLL',
            payload: { topLine: 42 },
        });

        assert.strictEqual(harness.revealedCalls.length, 1);
        assert.strictEqual(harness.revealedCalls[0].range.start.line, 42);
        assert.strictEqual(harness.revealedCalls[0].revealType, vscode.TextEditorRevealType.AtTop);

        harness.visibleRangesEmitter.fire({
            textEditor: harness.mockEditor,
            visibleRanges: [new vscode.Range(43, 0, 63, 0)],
        });

        const echoMsgs = harness.postedMessages.filter(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                (m as { type?: string }).type === 'SYNC_EDITOR_SCROLL',
        );
        assert.strictEqual(echoMsgs.length, 0, 'ロック期間中はエコーバックされないこと');
    });

    test('UPDATE_QUICK_SETTINGS で scrollSyncEnabled を false にすると双方向同期が無効化され、設定へ保存されること', async () => {
        await harness.provider.openSideEditor();
        harness.postedMessages.length = 0;
        const listener = harness.getReceiveListener();
        assert.ok(listener);

        await listener({
            type: 'UPDATE_QUICK_SETTINGS',
            payload: { scrollSyncEnabled: false },
        });

        assert.strictEqual(harness.getScrollSyncSetting(), false);

        const settingsMsg = harness.postedMessages.find(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                (m as { type?: string }).type === 'SYNC_SETTINGS',
        ) as { scrollSyncEnabled?: boolean } | undefined;
        assert.strictEqual(settingsMsg?.scrollSyncEnabled, false);

        harness.postedMessages.length = 0;
        harness.visibleRangesEmitter.fire({
            textEditor: harness.mockEditor,
            visibleRanges: [new vscode.Range(30, 0, 50, 0)],
        });
        assert.strictEqual(
            harness.postedMessages.filter(
                (m) =>
                    typeof m === 'object' &&
                    m !== null &&
                    (m as { type?: string }).type === 'SYNC_EDITOR_SCROLL',
            ).length,
            0,
        );

        await listener({
            type: 'SYNC_WEBVIEW_SCROLL',
            payload: { topLine: 55 },
        });
        assert.strictEqual(harness.revealedCalls.length, 0);
    });

    test('computeEditorLineHeight が VS Code エディタ本体と同じ規則で1行の高さを算出し、SYNC_SETTINGS に含まれること', async () => {
        assert.strictEqual(computeEditorLineHeight(14, 0, 'win32'), 19);
        assert.strictEqual(computeEditorLineHeight(14, 0, 'darwin'), 21);
        assert.strictEqual(computeEditorLineHeight(16, 1.5, 'win32'), 24);
        assert.strictEqual(computeEditorLineHeight(14, 26, 'win32'), 26);

        await harness.provider.openSideEditor();
        const settingsMsg = harness.postedMessages.find(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                (m as { type?: string }).type === 'SYNC_SETTINGS',
        ) as { editorFontSize?: number; editorLineHeight?: number } | undefined;

        assert.strictEqual(settingsMsg?.editorFontSize, 14);
        assert.strictEqual(
            settingsMsg?.editorLineHeight,
            computeEditorLineHeight(14, 0, process.platform),
        );
    });
});

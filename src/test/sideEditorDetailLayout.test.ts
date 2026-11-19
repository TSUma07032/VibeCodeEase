/**
 * [Why/Intent] 詳細＆AIチャットパネル展開時のサイドバー幅一時拡大・元の幅への復元機能を検証するテストスイート。
 * - computeExpandedEditorLayout の比率計算（縦3ライン 34% : 33% : 33% 用に Webview を 66% へ拡大）
 * - SET_DETAIL_PANEL_OPEN (true / false) および dispose 時の vscode.setEditorLayout 呼び出しを検証する。
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import { SideEditorProvider } from '../vscode-utils/SideEditorProvider';
import {
    computeExpandedEditorLayout,
    type EditorLayout,
} from '../vscode-utils/editorLayoutHelper';

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
    private readonly emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
    public readonly onDidChange = this.emitter.event;
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
        this.emitter.dispose();
    }
}

suite('SideEditorProvider Detail Layout Expansion Test Suite', () => {
    let originalCreatePanel: typeof vscode.window.createWebviewPanel;
    let originalExecuteCommand: typeof vscode.commands.executeCommand;
    let setLayoutCalls: EditorLayout[] = [];
    let currentLayout: EditorLayout;
    let receiveListener: ((msg: unknown) => Promise<void>) | undefined;
    let disposeListener: (() => void) | undefined;
    let provider: SideEditorProvider;

    setup(() => {
        SideEditorProvider.resetInstanceForTesting();
        setLayoutCalls = [];
        receiveListener = undefined;
        disposeListener = undefined;
        currentLayout = { orientation: 0, groups: [{ size: 0.5 }, { size: 0.5 }] };

        const mockContext = {
            workspaceState: new MockMemento(),
            globalState: new MockMemento() as unknown as vscode.Memento & {
                setKeysForSync(): void;
            },
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

        originalCreatePanel = vscode.window.createWebviewPanel;
        (vscode.window as { createWebviewPanel: unknown }).createWebviewPanel = () =>
            ({
                webview: {
                    html: '',
                    cspSource: 'vscode-webview://test',
                    asWebviewUri: (uri: vscode.Uri) => uri,
                    postMessage: () => Promise.resolve(true),
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

        originalExecuteCommand = vscode.commands.executeCommand;
        (vscode.commands as { executeCommand: unknown }).executeCommand = (
            command: string,
            ...args: unknown[]
        ) => {
            if (command === 'vscode.getEditorLayout') {
                return Promise.resolve(currentLayout);
            }
            if (command === 'vscode.setEditorLayout') {
                const next = args[0] as EditorLayout;
                setLayoutCalls.push(next);
                currentLayout = next;
                return Promise.resolve(undefined);
            }
            return Promise.resolve(undefined);
        };

        provider = SideEditorProvider.getInstance(mockContext, mockLlmService);
    });

    teardown(() => {
        SideEditorProvider.resetInstanceForTesting();
        (vscode.window as { createWebviewPanel: typeof originalCreatePanel }).createWebviewPanel =
            originalCreatePanel;
        (
            vscode.commands as { executeCommand: typeof originalExecuteCommand }
        ).executeCommand = originalExecuteCommand;
    });

    test('computeExpandedEditorLayout: 2分割 50:50 を縦3ライン用の 34:66 へ変換すること', () => {
        const expanded = computeExpandedEditorLayout({
            orientation: 0,
            groups: [{ size: 0.5 }, { size: 0.5 }],
        });
        assert.ok(expanded?.groups);
        assert.strictEqual(expanded.groups[0].size, 0.34);
        assert.strictEqual(expanded.groups[1].size, 0.66);
    });

    test('SET_DETAIL_PANEL_OPEN (true → false) でサイドバー幅が一時拡大され、閉じると元の 50:50 に復元されること', async () => {
        await provider.openSideEditor();
        assert.ok(receiveListener);

        await receiveListener({ type: 'SET_DETAIL_PANEL_OPEN', payload: { isOpen: true } });
        assert.strictEqual(setLayoutCalls.length, 1);
        assert.strictEqual(setLayoutCalls[0].groups?.[0].size, 0.34);
        assert.strictEqual(setLayoutCalls[0].groups?.[1].size, 0.66);

        await receiveListener({ type: 'SET_DETAIL_PANEL_OPEN', payload: { isOpen: false } });
        assert.strictEqual(setLayoutCalls.length, 2);
        assert.strictEqual(setLayoutCalls[1].groups?.[0].size, 0.5);
        assert.strictEqual(setLayoutCalls[1].groups?.[1].size, 0.5);
    });

    test('詳細パネル展開中に Webview パネルを dispose しても元のレイアウトへ復元されること', async () => {
        await provider.openSideEditor();
        assert.ok(receiveListener);

        await receiveListener({ type: 'SET_DETAIL_PANEL_OPEN', payload: { isOpen: true } });
        assert.strictEqual(setLayoutCalls.length, 1);

        provider.dispose();
        await new Promise((resolve) => setTimeout(resolve, 10));

        assert.strictEqual(setLayoutCalls.length, 2);
        assert.strictEqual(setLayoutCalls[1].groups?.[0].size, 0.5);
        assert.strictEqual(setLayoutCalls[1].groups?.[1].size, 0.5);
    });
});

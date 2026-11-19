/**
 * [Why/Intent] SideEditorProvider における専用設定画面オープン機能（openSettings）、
 * 新規Webviewマウント時のreadyハンドシェイクによるNAVIGATE_TO_SETTINGS送信、
 * 既存パネル存在時の即座ディスパッチ、マウント前連続呼び出しにおけるレースコンディション防止、
 * およびパネル破棄時のクリーンアップを網羅的に検証する結合テストスイート。
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import { SideEditorProvider } from '../vscode-utils/SideEditorProvider';

/**
 * [Why/Intent] VS CodeのMementoインターフェースをインメモリMapで忠実にシミュレートし、
 * テスト実行時における拡張機能コンテキストのグローバル/ワークスペース状態管理を再現するモッククラス。
 */
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

/**
 * [Why/Intent] VS CodeのSecretStorageインターフェースをインメモリMapでシミュレートし、
 * APIキー等の機密情報の読み書き・一覧取得をテスト環境で安全に提供するモッククラス。
 */
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

suite('SideEditorProvider openSettings Integration Test Suite', () => {
    let mockContext: vscode.ExtensionContext;
    let mockLlmService: LlmBackgroundService;
    let provider: SideEditorProvider;
    let postedMessages: unknown[] = [];
    let panelRevealCalled = false;
    let mockReceiveMessageListener: ((msg: unknown) => Promise<void>) | undefined;
    let mockDisposeListener: (() => void) | undefined;
    let originalCreateWebviewPanel: typeof vscode.window.createWebviewPanel;

    setup(() => {
        SideEditorProvider.resetInstanceForTesting();
        postedMessages = [];
        panelRevealCalled = false;
        mockReceiveMessageListener = undefined;
        mockDisposeListener = undefined;

        mockContext = {
            workspaceState: new MockMemento(),
            globalState: new MockMemento() as unknown as vscode.Memento & {
                setKeysForSync(): void;
            },
            secrets: new MockSecretStorage(),
            extensionUri: vscode.Uri.file('/mock/extension'),
            subscriptions: [],
        } as unknown as vscode.ExtensionContext;

        const dummyEmitter = new vscode.EventEmitter<unknown>();
        mockLlmService = {
            onDidUpdateDashboard: dummyEmitter,
            pause: () => {},
            resume: () => {},
            getDashboardState: () => ({ status: 'idle', response: null, logs: [] }),
        } as unknown as LlmBackgroundService;

        originalCreateWebviewPanel = vscode.window.createWebviewPanel;
        (vscode.window as { createWebviewPanel: unknown }).createWebviewPanel = () => {
            return {
                webview: {
                    html: '',
                    cspSource: 'vscode-webview://test',
                    asWebviewUri: (uri: vscode.Uri) => uri,
                    postMessage: (msg: unknown) => {
                        postedMessages.push(msg);
                        return Promise.resolve(true);
                    },
                    onDidReceiveMessage: (listener: (msg: unknown) => Promise<void>) => {
                        mockReceiveMessageListener = listener;
                        return { dispose: () => {} };
                    },
                },
                reveal: () => {
                    panelRevealCalled = true;
                },
                onDidDispose: (listener: () => void) => {
                    mockDisposeListener = listener;
                    return { dispose: () => {} };
                },
                dispose: () => {
                    mockDisposeListener?.();
                },
            } as unknown as vscode.WebviewPanel;
        };

        provider = SideEditorProvider.getInstance(mockContext, mockLlmService);
    });

    teardown(() => {
        SideEditorProvider.resetInstanceForTesting();
        (
            vscode.window as { createWebviewPanel: typeof originalCreateWebviewPanel }
        ).createWebviewPanel = originalCreateWebviewPanel;
    });

    test('テストケース 1: パネル非存在時に openSettings を呼ぶと pendingTab が settings となり、ready ハンドシェイクで NAVIGATE_TO_SETTINGS が送信されること', async () => {
        await provider.openSettings();

        assert.strictEqual(
            provider.getPendingTab(),
            'settings',
            'Webviewマウント完了前は pendingTab が settings であること',
        );

        assert.ok(mockReceiveMessageListener, 'Webviewのメッセージリスナーが登録されていること');
        await mockReceiveMessageListener({ command: 'ready' });

        const navMsg = postedMessages.find(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                (m as { type?: string }).type === 'NAVIGATE_TO_SETTINGS',
        );
        assert.ok(navMsg, 'NAVIGATE_TO_SETTINGS メッセージが postMessage されていること');
        assert.strictEqual(
            provider.getPendingTab(),
            undefined,
            '送信後に pendingTab がクリアされていること',
        );
    });

    test('テストケース 2: パネル存在時に openSettings を呼ぶと即座に reveal され NAVIGATE_TO_SETTINGS が postMessage されること', async () => {
        await provider.openSideEditor();
        postedMessages = [];
        panelRevealCalled = false;

        await provider.openSettings();

        assert.strictEqual(panelRevealCalled, true, '既存パネルが reveal されること');
        const navMsg = postedMessages.find(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                (m as { type?: string }).type === 'NAVIGATE_TO_SETTINGS',
        );
        assert.ok(navMsg, '即座に NAVIGATE_TO_SETTINGS が送信されていること');
    });

    test('テストケース 3: Webviewマウント完了前に連続で openSettings が呼ばれてもフラグが消失せず ready 受信時に正常にメッセージが届くこと', async () => {
        await provider.openSettings();
        await provider.openSettings();

        assert.ok(mockReceiveMessageListener, 'Webviewのメッセージリスナーが登録されていること');
        await mockReceiveMessageListener({ command: 'ready' });

        const navMsgs = postedMessages.filter(
            (m) =>
                typeof m === 'object' &&
                m !== null &&
                (m as { type?: string }).type === 'NAVIGATE_TO_SETTINGS',
        );
        assert.ok(navMsgs.length >= 1, 'ready受信時にNAVIGATE_TO_SETTINGSが確実に送信されること');
    });

    test('テストケース 4: パネル dispose 時に pendingTab が安全にクリアされること', async () => {
        await provider.openSettings();
        assert.strictEqual(
            provider.getPendingTab(),
            'settings',
            'dispose前は pendingTab が settings であること',
        );

        provider.dispose();

        assert.strictEqual(
            provider.getPendingTab(),
            undefined,
            'dispose後に pendingTab が undefined にクリアされていること',
        );
    });
});

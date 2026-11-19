/**
 * [Why/Intent] LLM通信設定（APIキー・プロバイダ・モデル）の永続化および動的同期を統括するリポジトリ。
 * SecretStorageとVS Code設定のフォールバックを一元管理し、設定変更を即時通知する（RULE-008）。
 */
import * as vscode from 'vscode';
import type { LlmConfig, LlmProvider } from '../../types';
import { DEFAULT_GEMINI_MODEL } from './llmConstants';

/**
 * [Why/Intent] LLM通信設定（APIキー・プロバイダ・モデル）の永続化および動的同期を統括するリポジトリ。
 * SecretStorageとVS Code設定のフォールバックを一元管理し、設定変更を即時通知する。
 */
export class LlmConfigRepository implements vscode.Disposable {
    /** [Why/Intent] 設定値の変更を外部へ即時通知するイベントエミッター */
    private readonly _onDidChangeConfig = new vscode.EventEmitter<LlmConfig>();
    /** [Why/Intent] 設定変更購読イベント */
    public readonly onDidChangeConfig = this._onDidChangeConfig.event;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(private readonly secrets: vscode.SecretStorage) {
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('vibecodeease')) {
                    this._onDidChangeConfig.fire(this.getLlmConfig());
                }
            }),
        );
    }

    /**
     * [Why/Intent] SecretStorageからのみAPIキーを取得する。
     */
    public async getApiKey(): Promise<string | undefined> {
        const secret = await this.secrets.get('vibecodeease.geminiApiKey');
        return secret?.trim() ? secret.trim() : undefined;
    }

    /**
     * [Why/Intent] APIキーをSecretStorageに安全に保存（または空文字で削除）し、イベントを発火する。
     */
    public async setApiKey(apiKey?: string): Promise<void> {
        if (apiKey?.trim()) {
            await this.secrets.store('vibecodeease.geminiApiKey', apiKey.trim());
        } else {
            await this.secrets.delete('vibecodeease.geminiApiKey');
        }
        this._onDidChangeConfig.fire(this.getLlmConfig());
    }

    /**
     * [Why/Intent] 現在のプロバイダと選択モデルを設定からオンデマンド取得する。
     */
    public getLlmConfig(): LlmConfig {
        const config = vscode.workspace.getConfiguration('vibecodeease');
        const provider = config.get<LlmProvider>('llmProvider', 'gemini');
        const model = config.get<string>('llmModel', DEFAULT_GEMINI_MODEL);
        return { provider, model };
    }

    /**
     * [Why/Intent] 登録されたイベントエミッターとリスナーを安全に解放する。
     */
    public dispose(): void {
        this._onDidChangeConfig.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
    }
}

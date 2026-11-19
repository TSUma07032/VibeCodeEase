/**
 * [Why/Intent] 学習支援のユーザーカスタマイズ設定をVS Code Mementoに永続化し、変更イベントを配信するStore。
 */
import * as vscode from 'vscode';
import type { UserLearningConfig } from '../../types/learningSettings';
import { DEFAULT_USER_LEARNING_CONFIG } from './defaultLearningConfig';
import { clampUserLearningConfig } from './learningConfigValidator';

/**
 * [Why/Intent] ユーザー設定の永続化と変更通知を担うStoreクラス。
 */
export class LearningConfigStore implements vscode.Disposable {
    /** [Why/Intent] Mementoへ設定を永続化する際の一意な識別キー */
    public static readonly STORAGE_KEY = 'vibeCodeEase.userLearningConfig';

    private readonly _onDidChangeConfig = new vscode.EventEmitter<UserLearningConfig>();
    /** [Why/Intent] 設定更新時に外部コンポーネントへ最新設定を通知するイベントリスナー */
    public readonly onDidChangeConfig = this._onDidChangeConfig.event;

    private _config: UserLearningConfig;

    /** [Why/Intent] Mementoストレージから既存設定を読み込み、境界値クランプを行ってメモリ初期化する */
    constructor(private readonly storage: vscode.Memento) {
        const stored = this.storage.get<Partial<UserLearningConfig>>(
            LearningConfigStore.STORAGE_KEY,
        );
        this._config = clampUserLearningConfig(stored ?? DEFAULT_USER_LEARNING_CONFIG);
    }

    /** [Why/Intent] 現在の設定値のイミュータブルなコピーを取得する */
    public getConfig(): UserLearningConfig {
        return { ...this._config };
    }

    /** [Why/Intent] パッチ設定を受け取り、クランプして永続化し、変更イベントを発火する */
    public async updateConfig(patch: Partial<UserLearningConfig>): Promise<UserLearningConfig> {
        this._config = clampUserLearningConfig({ ...this._config, ...patch });
        await this.storage.update(LearningConfigStore.STORAGE_KEY, this._config);
        this._onDidChangeConfig.fire(this.getConfig());
        return this.getConfig();
    }

    /** [Why/Intent] デフォルト初期値でストレージをリセットする */
    public async resetConfig(): Promise<UserLearningConfig> {
        this._config = { ...DEFAULT_USER_LEARNING_CONFIG };
        await this.storage.update(LearningConfigStore.STORAGE_KEY, this._config);
        this._onDidChangeConfig.fire(this.getConfig());
        return this.getConfig();
    }

    /** [Why/Intent] 登録されたイベントエミッターを破棄してメモリリークを防ぐ */
    public dispose(): void {
        this._onDidChangeConfig.dispose();
    }
}

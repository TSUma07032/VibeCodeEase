/**
 * [Why/Intent] 学習支援設定パネルで使用するユーザー設定パラメータおよびWebview-Extension間IPCメッセージの型定義。
 */

/**
 * [Why/Intent] ユーザーがカスタマイズ可能な学習支援パラメータを定義するモデル。
 */
export interface UserLearningConfig {
    /** [Why/Intent] AI完成形予想の生成インターバル (秒、10〜300) */
    intervalSeconds: number;
    /** [Why/Intent] キー入力後のデバウンス待機時間 (ミリ秒、2000〜15000) */
    debounceMs: number;
    /** [Why/Intent] 停滞とみなす連続生成回数 n (回、2〜10) */
    stagnationThresholdN: number;
    /** [Why/Intent] 進捗停滞判定の変化率不感帯 (%) (1〜20) */
    progressDeltaThreshold: number;
    /** [Why/Intent] 「自力で続ける」のスヌーズ時間 (分、1〜30) */
    snoozeMinutes: number;
    /** [Why/Intent] デフォルトのヒント開示モード */
    defaultDisclosureMode: 'stepByStep' | 'direct';
    /** [Why/Intent] 学習セッション中に既存のLlmBackgroundServiceを自動一時停止するか */
    pauseExistingAnalysisDuringLearning: boolean;
}

/**
 * [Why/Intent] WebviewからExtensionへ送る学習支援設定メッセージ。
 */
export type LearningSettingsWebviewMessage =
    | { type: 'REQUEST_LEARNING_CONFIG' }
    | { type: 'UPDATE_LEARNING_CONFIG'; payload: Partial<UserLearningConfig> }
    | { type: 'RESET_LEARNING_CONFIG' };

/**
 * [Why/Intent] ExtensionからWebviewへ送る学習支援設定メッセージ。
 */
export type LearningSettingsExtensionMessage =
    | { type: 'SYNC_LEARNING_CONFIG'; payload: UserLearningConfig }
    | { type: 'NOTIFY_CONFIG_SAVED'; payload: { success: boolean; message?: string } };

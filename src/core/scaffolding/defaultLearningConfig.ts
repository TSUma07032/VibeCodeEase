/**
 * [Why/Intent] RULE-002に準拠し、すべての閾値に選定根拠(Why)を付与した学習支援サブシステムの設定定数を定義する。
 */
export const LEARNING_CONFIG = {
    /** [Why/Intent] Gemini無料枠15RPMおよびユーザーの思考猶予を保護するための最小インターバル */
    MIN_INTERVAL_SECONDS: 30,
    /** [Why/Intent] タイピング途中の不完全コード送信を防ぐためのデバウンス時間 (ミリ秒) */
    DEBOUNCE_MS: 5000,
    /** [Why/Intent] 約90〜120秒の無進展を行き詰まりと検知するための連続生成回数 */
    DEFAULT_THRESHOLD_N: 3,
    /** [Why/Intent] LLM出力スコアの微細な揺らぎによる判定リセットを防止する不感帯 (%) */
    PROGRESS_DELTA_THRESHOLD: 5,
    /** [Why/Intent] 学習目標核心タスク未達時に外見動作だけで高進捗と誤認させないための上限 (%) */
    CORE_TASK_CAP_PROGRESS: 60,
    /** [Why/Intent] 構文・実行エラー1件あたりの減点ペナルティ (%) */
    DIAGNOSTIC_PENALTY_PER_ERROR: 5,
    /** [Why/Intent] エラー減点の最大上限 (%) */
    MAX_DIAGNOSTIC_PENALTY: 20,
    /** [Why/Intent] 「自力で続ける」選択時の教育的見守りスヌーズ時間 (3分 = 180000ms) */
    SNOOZE_DURATION_MS: 180000,
    /** [Why/Intent] project-rules.md準拠の同期間隔クランプ範囲 */
    MIN_CLAMP_SECONDS: 5,
    /** [Why/Intent] 1時間以上の放置セッションは実質放棄とみなし、無限バックグラウンドポーリングによるリソース枯渇を防ぐための上限同期間隔 (3600秒 = 1時間) */
    MAX_CLAMP_SECONDS: 3600,
    /** [Why/Intent] Memento永続化用のストレージキー */
    STORAGE_KEY: 'vibecodeease.learningSessionState',
    /** [Why/Intent] 履歴スナップショットの最大保持件数 */
    MAX_HISTORY_LENGTH: 20,
} as const;

/**
 * [Why/Intent] ユーザーが変更可能な各設定値の許容境界値およびデフォルト値定数。
 */
export const USER_CONFIG_BOUNDS = {
    /** [Why/Intent] Gemini無料枠(15RPM)保護のための下限10秒、セッション離脱とみなす上限300秒 */
    INTERVAL_SECONDS: { MIN: 10, MAX: 300, DEFAULT: 30 },
    /** [Why/Intent] 不完全構文送信を防ぐ下限2000ms、遅延を感じさせない上限15000ms */
    DEBOUNCE_MS: { MIN: 2000, MAX: 15000, DEFAULT: 5000 },
    /** [Why/Intent] UI設定入力用の秒単位デバウンス範囲 (2〜15秒、標準5秒) */
    DEBOUNCE_SECONDS: { MIN: 2, MAX: 15, DEFAULT: 5 },
    /** [Why/Intent] 一時的休止の誤検知防止の下限2回、長時間放置防止の上限10回 (標準3回) */
    STAGNATION_THRESHOLD_N: { MIN: 2, MAX: 10, DEFAULT: 3 },
    /** [Why/Intent] 微細進捗検知の下限1%、LLMスコア揺らぎ許容の上限20% (標準5%) */
    PROGRESS_DELTA_THRESHOLD: { MIN: 1, MAX: 20, DEFAULT: 5 },
    /** [Why/Intent] 短時間挑戦の下限1分、セッション忘れ防止の上限30分 (教育的推奨3分) */
    SNOOZE_MINUTES: { MIN: 1, MAX: 30, DEFAULT: 3 },
} as const;

/**
 * [Why/Intent] システム標準の初期設定値定数。
 */
export const DEFAULT_USER_LEARNING_CONFIG = {
    /** [Why/Intent] 標準的な予想生成間隔 (30秒) */
    intervalSeconds: USER_CONFIG_BOUNDS.INTERVAL_SECONDS.DEFAULT,
    /** [Why/Intent] 標準的なキー入力デバウンス待機時間 (5000ms) */
    debounceMs: USER_CONFIG_BOUNDS.DEBOUNCE_MS.DEFAULT,
    /** [Why/Intent] 標準的な停滞判定連続回数 (3回) */
    stagnationThresholdN: USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N.DEFAULT,
    /** [Why/Intent] 標準的な進捗停滞判定の変化率不感帯 (5%) */
    progressDeltaThreshold: USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD.DEFAULT,
    /** [Why/Intent] 標準的な教育的見守りスヌーズ時間 (3分) */
    snoozeMinutes: USER_CONFIG_BOUNDS.SNOOZE_MINUTES.DEFAULT,
    /** [Why/Intent] 初見でのネタバレを防ぎ、段階的気付きを促すためのstepByStep */
    defaultDisclosureMode: 'stepByStep' as const,
    /** [Why/Intent] 学習中の推論と既存推敲によるAPIレートリミット競合を防ぐためのtrue */
    pauseExistingAnalysisDuringLearning: true,
} as const;

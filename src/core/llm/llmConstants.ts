/**
 * [Why/Intent] 全システムで共通利用されるGeminiモデルリスト、デフォルトモデル、タイムアウト値、キャッシュTTLの一元定義。
 * モデル名のハードコードや設定間の不整合（TTSモデル混在等）を排除し、コード推敲に適した推奨モデル群を安全に管理する。
 */

/**
 * [Why/Intent] vibeCodeEaseで公式サポートするGeminiテキスト推敲・構造化出力モデル一覧。
 * 安定稼働とJSON Schema出力を保証できるモデルのみをホワイトリスト形式で厳選している。
 */
export const GEMINI_SUPPORTED_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
] as const;

/**
 * [Why/Intent] サポートされるGeminiモデルの文字列リテラル型
 */
export type GeminiSupportedModel = (typeof GEMINI_SUPPORTED_MODELS)[number];

/** [Why/Intent] 新規インストール時および推奨のデフォルトモデル（高速・低レイテンシ） */
export const DEFAULT_GEMINI_MODEL: GeminiSupportedModel = 'gemini-3.5-flash-lite';

/** [Why/Intent] テキストのベクトル化（パーソナライズEmbedding）に用いるデフォルトモデル */
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

/** [Why/Intent] LLM通信のデフォルトタイムアウト時間（30秒） */
export const DEFAULT_LLM_TIMEOUT_MS = 30000;

/** [Why/Intent] discoverModels() のメモリキャッシュ有効期間（10分） */
export const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

/** [Why/Intent] 自動推敲インターバル（秒）のデフォルト値（過剰リクエスト・課金スパイク防止のため30秒） */
export const DEFAULT_SYNC_INTERVAL_SECONDS = 30;

/** [Why/Intent] 自動推敲インターバル（秒）の最小クランプ値（APIレートリミット保護および過剰消費抑制のため30秒） */
export const MIN_SYNC_INTERVAL_SECONDS = 30;

/** [Why/Intent] 自動推敲インターバル（秒）の最大クランプ値（1時間） */
export const MAX_SYNC_INTERVAL_SECONDS = 3600;

/** [Why/Intent] 自動推敲（onSave/interval）の対象とするドキュメントの最大行数。トークン過剰消費とJSONスキーマ不整合を防止 */
export const MAX_AUTO_ANALYSIS_LINES = 300;

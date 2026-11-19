/**
 * [Why/Intent] LLM通信エラーの構造化表現および主要HTTPステータス・Node.js例外・VS Code LM例外からの安全なマッピングを提供するモジュール。
 * 上位サービス層が脆い文字列正規表現パースを行うことなく、型安全にエラー分類と推奨対処法を取得できるようにする。
 */
import * as vscode from 'vscode';

/**
 * [Why/Intent] LLM通信およびプロバイダ層で発生する全エラーの分類コード。
 * 上位サービスが文字列マッチングに頼ることなく安全に型判定できるように網羅的に定義する。
 */
export type LlmErrorCode =
    | 'AUTH_MISSING' // 401, 403, またはAPIキー未設定 / VS Code LM未ログイン
    | 'MODEL_NOT_FOUND' // 404 (指定モデルが存在しない / LMプロバイダー未検出)
    | 'RATE_LIMIT' // 429 (一時的リクエスト頻度超過)
    | 'QUOTA_EXCEEDED' // 429 (月間・課金クォータ超過)
    | 'SERVER_ERROR' // 503, 500 (APIサーバー障害)
    | 'TIMEOUT' // リクエストタイムアウト (30s)
    | 'NETWORK' // ネットワーク接続不能・DNS解決失敗
    | 'PARSE_ERROR' // JSON構文・スキーマ不整合
    | 'UNKNOWN'; // 未知のエラー

/**
 * [Why/Intent] 各エラーコードに対応するユーザー向け推奨対処法メッセージ。
 * UIダッシュボードおよびステータスバーで直ちに表示可能な具体的アクションを事前定義する。
 */
export const LLM_SUGGESTED_ACTIONS: Record<LlmErrorCode, string> = {
    AUTH_MISSING:
        'Gemini APIキーが無効または未設定です。サイドバーの「全般設定」またはコマンドパレットから有効なAPIキーを設定してください（VS Code LM使用時はCopilot等にログインしてください）。',
    MODEL_NOT_FOUND:
        '指定されたモデルは現在利用できません。Gatewayにより自動で代替モデルへのフォールバックを試みるか、設定から別のモデル（例: gemini-3.5-flash-lite）を選択してください。',
    RATE_LIMIT:
        'APIレート制限（リクエスト頻度超過）に達しました。数秒〜数十秒待ってから再試行してください。',
    QUOTA_EXCEEDED:
        'Gemini APIのクォータ上限に達しました。Google AI Studioでプランまたは利用枠・課金設定を確認してください。',
    SERVER_ERROR:
        'Geminiサーバーが一時的に混雑または停止しています。時間をおいて再実行してください。',
    TIMEOUT:
        'LLM API通信が30秒でタイムアウトしました。通信環境を確認するか、より高速なモデル（gemini-3.5-flash-lite等）を選択してください。',
    NETWORK:
        'インターネット接続が切断されているか、プロキシ環境等でAPIエンドポイントにアクセスできません。ネットワーク接続設定を確認してください。',
    PARSE_ERROR:
        'LLMから返却されたレスポンスの構文解析（JSON構造化）に失敗しました。プロンプトまたはモデルの出力設定を確認してください。',
    UNKNOWN:
        'LLM通信中に予期せぬエラーが発生しました。開発コンソール（Developer Tools）のログを確認してください。',
};

/**
 * [Why/Intent] LlmError インスタンス生成に必要なパラメータ定義
 */
export interface LlmErrorParams {
    /** [Why/Intent] エラー種別コード */
    code: LlmErrorCode;
    /** [Why/Intent] 人間可読なエラーメッセージ */
    message: string;
    /** [Why/Intent] HTTPステータスコード（該当する場合） */
    statusCode?: number;
    /** [Why/Intent] ユーザー向け対処法メッセージ（省略時はデフォルト） */
    suggestedAction?: string;
    /** [Why/Intent] 自動再試行が推奨されるか否か */
    retryable?: boolean;
    /** [Why/Intent] 根本原因となった下位例外オブジェクト */
    cause?: unknown;
}

/**
 * [Why/Intent] LLM通信エラーを一元管理する構造化例外クラス。
 * エラーコード・ステータスコード・推奨対処法・再試行可否・原因例外を保持する。
 */
export class LlmError extends Error {
    public readonly code: LlmErrorCode;
    public readonly statusCode?: number;
    public readonly suggestedAction: string;
    public readonly retryable: boolean;

    constructor(params: LlmErrorParams) {
        super(params.message);
        this.name = 'LlmError';
        this.code = params.code;
        this.statusCode = params.statusCode;
        this.suggestedAction = params.suggestedAction ?? LLM_SUGGESTED_ACTIONS[params.code];
        this.retryable =
            params.retryable ?? (params.code === 'SERVER_ERROR' || params.code === 'NETWORK');
        if (params.cause) {
            (this as { cause?: unknown }).cause = params.cause;
        }
    }
}

/** [Why/Intent] HTTP 429 状態のクォータ判定ヘルパー */
function classify429Error(body: string, statusCode: number, cause?: unknown): LlmError {
    const isQuota = body.includes('quota') || body.includes('resource_exhausted');
    return new LlmError({
        code: isQuota ? 'QUOTA_EXCEEDED' : 'RATE_LIMIT',
        statusCode,
        message: `レート/クォータ制限 (HTTP 429): ${body.slice(0, 160)}`,
        retryable: !isQuota,
        cause,
    });
}

/**
 * [Why/Intent] HTTPレスポンスステータスおよび本文から適切なLlmErrorを生成する。
 */
export function mapHttpErrorToLlmError(
    statusCode: number,
    body: string,
    cause?: unknown,
): LlmError {
    const lower = body.toLowerCase();
    if (
        statusCode === 401 ||
        statusCode === 403 ||
        lower.includes('api key') ||
        lower.includes('auth')
    ) {
        return new LlmError({
            code: 'AUTH_MISSING',
            statusCode,
            message: `認証エラー (HTTP ${statusCode}): ${body.slice(0, 160)}`,
            cause,
        });
    }
    if (statusCode === 404) {
        return new LlmError({
            code: 'MODEL_NOT_FOUND',
            statusCode,
            message: `モデル未検出 (HTTP 404): ${body.slice(0, 160)}`,
            cause,
        });
    }
    if (statusCode === 429) {
        return classify429Error(lower, statusCode, cause);
    }
    if (statusCode === 500 || statusCode === 503) {
        return new LlmError({
            code: 'SERVER_ERROR',
            statusCode,
            message: `サーバー障害 (HTTP ${statusCode}): ${body.slice(0, 160)}`,
            retryable: true,
            cause,
        });
    }
    return new LlmError({
        code: 'UNKNOWN',
        statusCode,
        message: `API通信失敗 (HTTP ${statusCode}): ${body.slice(0, 160)}`,
        cause,
    });
}

/** [Why/Intent] ネットワーク接続遮断・DNS解決失敗を示すキーワード判定 */
function isNetworkErrorKeyword(lower: string): boolean {
    return (
        lower.includes('enotfound') ||
        lower.includes('econnrefused') ||
        lower.includes('econnreset') ||
        lower.includes('network') ||
        lower.includes('fetch')
    );
}

/**
 * [Why/Intent] Node.js の https.request レベルで発生するネットワーク・ソケット・タイムアウトエラーをマッピングする。
 */
export function mapNetworkErrorToLlmError(error: unknown): LlmError {
    if (error instanceof LlmError) {
        return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (
        lower.includes('タイムアウト') ||
        lower.includes('timeout') ||
        lower.includes('etimedout')
    ) {
        return new LlmError({ code: 'TIMEOUT', message, retryable: true, cause: error });
    }
    if (isNetworkErrorKeyword(lower)) {
        return new LlmError({ code: 'NETWORK', message, retryable: true, cause: error });
    }
    return new LlmError({ code: 'UNKNOWN', message, cause: error });
}

/** [Why/Intent] 指定キーワード群のいずれかに部分一致するか判定するヘルパー（複雑度抑制） */
function matchesAnyKeyword(text: string, keywords: readonly string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
}

const LM_NOT_FOUND_KEYWORDS = ['not found', 'no model', 'no chat model', '見つかりません'] as const;
const LM_AUTH_KEYWORDS = ['auth', 'login', 'token', 'ログイン'] as const;
const LM_PARSE_KEYWORDS = ['json', 'parse'] as const;

/** [Why/Intent] VS Code LM APIのキーワードからLlmErrorCodeを判定するヘルパー */
function classifyVsCodeLmMessage(lower: string): LlmErrorCode {
    if (matchesAnyKeyword(lower, LM_NOT_FOUND_KEYWORDS)) {
        return 'MODEL_NOT_FOUND';
    }
    if (matchesAnyKeyword(lower, LM_AUTH_KEYWORDS)) {
        return 'AUTH_MISSING';
    }
    if (matchesAnyKeyword(lower, LM_PARSE_KEYWORDS)) {
        return 'PARSE_ERROR';
    }
    return 'UNKNOWN';
}

/**
 * [Why/Intent] VS Code LM APIの例外から適切なLlmErrorを生成する。
 * キャンセル時は vscode.CancellationError をそのまま再スローして上位の正常キャンセル処理を妨げない。
 */
export function mapVsCodeLmErrorToLlmError(error: unknown): LlmError {
    if (
        error instanceof vscode.CancellationError ||
        (error as Error)?.name === 'CancellationError'
    ) {
        throw error;
    }
    if (error instanceof LlmError) {
        return error;
    }
    if (error instanceof SyntaxError) {
        return new LlmError({ code: 'PARSE_ERROR', message: error.message, cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    const code = classifyVsCodeLmMessage(message.toLowerCase());
    return new LlmError({ code, message, cause: error });
}

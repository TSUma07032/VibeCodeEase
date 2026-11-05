/**
 * [Why/Intent] 機密ファイル（.env, .pem, .key, .git, secrets, credentials等）判定ロジックの単一ソース。
 * APIキー・パスワード・秘密鍵がLLMプロバイダーへ誤送信されるのを防止するセキュリティ境界を提供する。
 */
import type * as vscode from 'vscode';

/**
 * [Why/Intent] 機密ファイルとみなすファイル名・拡張子の正規表現パターン一覧。
 * APIキー・トークン・秘密鍵の漏洩を防止するために単一ソースで管理する。
 */
export const SENSITIVE_FILE_PATTERNS: readonly RegExp[] = [
    /\.env/i,
    /\.git/i,
    /secrets/i,
    /credentials/i,
    /\.pem$/i,
    /\.key$/i,
];

/**
 * [Why/Intent] 対象ドキュメントが機密ファイル（APIキーや秘密鍵）に該当するか判定する。
 */
export function isSensitiveDocument(document: vscode.TextDocument): boolean {
    if (document.languageId === 'secrets') {
        return true;
    }
    const fileName = document.fileName.toLowerCase();
    return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

/**
 * [Why/Intent] 機密ファイルである場合に即座にセキュリティ例外を送出する。
 */
export function assertNotSensitiveDocument(document: vscode.TextDocument): void {
    if (isSensitiveDocument(document)) {
        const fileNameOnly = document.uri?.path
            ? document.uri.path.split('/').pop()
            : document.fileName;
        throw new Error(
            `セキュリティエラー（セキュリティ違反）: 機密ファイル (${fileNameOnly}) はLLMに送信できません。`,
        );
    }
}

/**
 * [Why/Intent] Webview側における非侵襲オンデマンド・インラインAIコーディングアシスタントの
 * 共通型定義。
 */

/**
 * [Why/Intent] ユーザーが選択可能なペルソナ（AIの振る舞い・トーン）の識別子定義。
 */
export type PersonaId = 'mentor' | 'concise' | 'architect' | 'qa_security' | 'tutor';

/**
 * [Why/Intent] 介入項目のライフサイクル状態を表す型定義。
 * pending: 提案中（未適用）, applied: 適用済み, reverted: アンドゥ済み, dismissed: 却下済み。
 */
export type InterventionStatus = 'pending' | 'applied' | 'reverted' | 'dismissed';

/**
 * [Why/Intent] ドキュメント内の行・列位置を表す型定義。
 */
export interface Position {
    line: number;
    character: number;
}

/**
 * [Why/Intent] ドキュメント内の開始位置と終了位置からなる範囲型定義。
 */
export interface Range {
    start: Position;
    end: Position;
}

/**
 * [Why/Intent] Webviewサイドパネル内で送受信されるチャットメッセージの型定義。
 */
export interface ChatMessage {
    id: string;
    sender: 'user' | 'ai';
    message: string;
    timestamp: string; // ISO 8601
}

/**
 * [Why/Intent] 介入項目のサマリー情報を保持するデータ構造定義。
 */
export interface InterventionItem {
    id: string;
    title: string;
    summary: string;
    range: Range;
    status: InterventionStatus;
    personaId: PersonaId;
    createdAt: string;
    updatedAt: string;
}

/**
 * [Why/Intent] 介入項目の詳細情報（変更前コード、変更後コード、チャット履歴）を含むデータ構造定義。
 */
export interface InterventionDetail extends InterventionItem {
    originalCode: string;
    proposedCode: string;
    chatHistory: ChatMessage[];
}

/**
 * [Why/Intent] ドキュメントごとに永続化・管理される介入履歴の全体データ構造定義。
 */
export interface DocumentInterventionHistory {
    version: '1.0.0';
    documentUri: string;
    interventions: InterventionDetail[];
}

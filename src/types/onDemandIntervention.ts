/**
 * [Why/Intent] 非侵襲オンデマンド・インラインAIコーディングアシスタントにおける
 * 介入データ、ペルソナ、ステータス、ドキュメント履歴の共通型定義。
 */

/**
 * [Why/Intent] AIアシスタントの対話トーン・観点を定義する5大ペルソナ識別子。
 */
export type PersonaId = 'mentor' | 'concise' | 'architect' | 'qa_security' | 'tutor';

/**
 * [Why/Intent] インライン介入提案のライフサイクル状態（未適用・適用済み・差分アンドゥ後・却下済み）。
 */
export type InterventionStatus = 'pending' | 'applied' | 'reverted' | 'dismissed';

/**
 * [Why/Intent] エディタ上の行・列位置情報。
 */
export interface Position {
    line: number;
    character: number;
}

/**
 * [Why/Intent] エディタ上のコード選択・置換対象の開始・終了範囲。
 */
export interface Range {
    start: Position;
    end: Position;
}

/**
 * [Why/Intent] 提案ごとに保持されるユーザーおよびAIアシスタントのチャットメッセージ。
 */
export interface ChatMessage {
    id: string;
    sender: 'user' | 'ai';
    message: string;
    timestamp: string; // ISO 8601
}

/**
 * [Why/Intent] エディタ上の装飾や目次QuickPick表示に必要な介入サマリー情報。
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
 * [Why/Intent] WebviewサイドパネルでのDiff比較およびチャット対話に必要な介入詳細情報。
 */
export interface InterventionDetail extends InterventionItem {
    originalCode: string;
    proposedCode: string;
    chatHistory: ChatMessage[];
}

/**
 * [Why/Intent] ドキュメント単位でJSON永続化される介入履歴データ構造。
 */
export interface DocumentInterventionHistory {
    version: '1.0.0';
    documentUri: string;
    interventions: InterventionDetail[];
}

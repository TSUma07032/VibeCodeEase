/**
 * [Why/Intent] vibeCodeEase サイドバーの簡易設定およびステータスバッジで利用される
 * 定数定義およびヘルパー関数。コンポーネントから分離することで Fast Refresh の規約を遵守する。
 */
import type {
    InterventionItem,
    PersonaId,
} from '../types/onDemandIntervention';

/**
 * [Why/Intent] 介入一言（タイトル）の最大文字数上限（20〜30字以内）。
 */
export const MAX_SIDEBAR_TITLE_LENGTH = 30;

/**
 * [Why/Intent] ユーザーが選択可能な5大ペルソナの一覧定義（直感的でわかりやすい日本語名と説明文）。
 */
export const PERSONA_OPTIONS: Array<{
    id: PersonaId;
    label: string;
    description: string;
}> = [
    {
        id: 'mentor',
        label: '🌱 やさしい解説メンター（丁寧な基礎解説）',
        description: '初心者にもわかりやすく変更理由と背景を丁寧に解説します',
    },
    {
        id: 'concise',
        label: '⚡ 最短修正・要点のみ（結論ファースト）',
        description: '前置きを省き、変更コードと核心の理由だけを端的に提示します',
    },
    {
        id: 'architect',
        label: '🏗️ 設計・保守性レビュー（構造・読みやすさ）',
        description: '責務の分離・保守性・将来の拡張性の観点から助言します',
    },
    {
        id: 'qa_security',
        label: '🛡️ バグ・安全性チェック（例外・境界値対策）',
        description: 'エラー処理漏れ・null安全性・バグや脆弱性の防止を重視します',
    },
    {
        id: 'tutor',
        label: '💡 ヒントで自力解決サポート（考え方をガイド）',
        description: '答えを丸投げせず、問いかけとヒントで理解を深めます',
    },
];

/**
 * [Why/Intent] ユーザーが選択可能なGeminiモデルの一覧定義。
 */
export const MODEL_OPTIONS: Array<{ id: string; label: string }> = [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (最新・最高速)' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (軽量・推奨)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (高精度・複雑推敲)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

/**
 * [Why/Intent] ユーザーが選択可能なLLM介入トリガーの一覧定義。
 */
export const FREQUENCY_OPTIONS: Array<{
    id: 'manual' | 'onSave' | 'interval';
    label: string;
}> = [
    { id: 'onSave', label: 'ファイル保存時 (推奨)' },
    { id: 'interval', label: '定期実行 (1分ごと)' },
    { id: 'manual', label: '手動実行のみ' },
];

/**
 * [Why/Intent] 介入一言（タイトル）から不要なカテゴリプレフィックスやMarkdown記号を除去し、
 * 20〜30文字以内（最大30文字）に収めるフォーマッタ。
 */
export function formatShortTitle(rawTitle: string): string {
    const cleaned = rawTitle
        .replace(/^\[[A-Z_]+\]\s*/g, '')
        .replace(/^\$\([a-z-]+\)\s*/gi, '')
        .replace(/^(?:🤖|🌲|💡|🌱|⚡|🏗️|🛡️)+\s*/gu, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^(AI\s*提案|Did you mean)\s*[:：]?\s*/i, '')
        .split(/\r?\n/)[0]
        .trim();

    if (!cleaned) {
        return 'コード改善の提案';
    }
    if (cleaned.length <= MAX_SIDEBAR_TITLE_LENGTH) {
        return cleaned;
    }
    return `${cleaned.slice(0, MAX_SIDEBAR_TITLE_LENGTH - 1)}…`;
}

/**
 * [Why/Intent] 対話画面の初手セリフ（初期AIメッセージ）を選択中のペルソナに合わせて生成する。
 */
export function getPersonaOpeningLine(
    personaId?: PersonaId,
    title?: string,
): string {
    const shortTitle = formatShortTitle(title ?? 'この箇所');
    switch (personaId) {
        case 'concise':
            return `⚡ 「${shortTitle}」の最短修正案です。差分と要点を確認し、疑問点があれば端的にどうぞ。`;
        case 'architect':
            return `🏗️ 設計・保守性レビューの観点から「${shortTitle}」を提案しました。責務の分離や将来の拡張性について議論したい点があればお知らせください。`;
        case 'qa_security':
            return `🛡️ バグ・安全性チェックの観点から「${shortTitle}」を検出しました。境界値や例外発生時の挙動について確認したい点はありますか？`;
        case 'tutor':
            return `💡 ヒントで自力解決サポートです！「${shortTitle}」について、元のコードのままだとどんな場面で困りそうか、一緒に考えてみませんか？`;
        default:
            return `🌱 こんにちは！やさしい解説メンターです。「${shortTitle}」について、より分かりやすく安全な書き方を提案しました。気になる点があれば何でも聞いてくださいね！`;
    }
}

/**
 * [Why/Intent] 提案ステータスに応じたバッジ表示ラベルとカラー定義を返すヘルパー。
 */
export function getStatusBadge(status: InterventionItem['status']): {
    label: string;
    color: string;
} {
    switch (status) {
        case 'applied':
            return {
                label: '✓ 採用済',
                color: 'var(--vscode-testing-iconPassed, #4ec9b0)',
            };
        case 'reverted':
        case 'dismissed':
            return {
                label: '✕ 破棄済',
                color: 'var(--vscode-errorForeground, #f48771)',
            };
        default:
            return {
                label: '💡 未対応',
                color: 'var(--vscode-editorWarning-foreground, #cca700)',
            };
    }
}

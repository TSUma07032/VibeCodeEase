/**
 * [Why/Intent] vibeCodeEase サイドバーの簡易設定およびステータスバッジで利用される
 * 定数定義およびヘルパー関数。コンポーネントから分離することで Fast Refresh の規約を遵守する。
 */
import type {
    InterventionItem,
    PersonaId,
} from '../types/onDemandIntervention';

/**
 * [Why/Intent] ユーザーが選択可能な5大ペルソナの一覧定義（識別子、表示ラベル、説明文）。
 */
export const PERSONA_OPTIONS: Array<{
    id: PersonaId;
    label: string;
    description: string;
}> = [
    { id: 'mentor', label: 'AI (メンター)', description: '教育的で丁寧な解説とヒント' },
    { id: 'concise', label: 'AI (簡潔・要点)', description: '無駄のない最短の修正コード' },
    {
        id: 'architect',
        label: 'AI (シニア・設計)',
        description: '保守性・拡張性・クリーンアーキテクチャ重視',
    },
    { id: 'qa_security', label: 'AI (QA・セキュリティ)', description: 'エッジケース・脆弱性・堅牢性重視' },
    { id: 'tutor', label: 'AI (思考促進チューター)', description: 'ステップバイステップの易しい指導' },
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
 * [Why/Intent] 提案ステータスに応じたバッジ表示ラベルとカラー定義を返すヘルパー。
 */
export function getStatusBadge(status: InterventionItem['status']): {
    label: string;
    color: string;
} {
    switch (status) {
        case 'applied':
            return {
                label: '✅ 適用済',
                color: 'var(--vscode-testing-iconPassed, #4ec9b0)',
            };
        case 'reverted':
            return {
                label: '↩️ 取消済',
                color: 'var(--vscode-descriptionForeground, #888888)',
            };
        case 'dismissed':
            return {
                label: '🗑️ 却下',
                color: 'var(--vscode-errorForeground, #f48771)',
            };
        default:
            return {
                label: '🟡 未確認',
                color: 'var(--vscode-editorWarning-foreground, #cca700)',
            };
    }
}

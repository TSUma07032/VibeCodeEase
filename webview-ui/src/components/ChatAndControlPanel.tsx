/**
 * [Why/Intent] オンデマンドサイドパネルの右カラム（ペルソナ切替、チャット履歴、
 * 操作ボタングループ [アンドゥ/適用/却下]、チャット入力欄）を提供するコンポーネント。
 */
import React, { useState } from 'react';
import type { InterventionDetail, PersonaId } from '../types/onDemandIntervention';

/**
 * [Why/Intent] チャットおよび操作コントロールパネルコンポーネントが要求するプロパティ定義。
 * 介入詳細モデル、現在のペルソナ、チャット通信ローディング状態、および各種操作アクションコールバックを提供する。
 */
export interface ChatAndControlPanelProps {
    detail: InterventionDetail;
    persona: PersonaId;
    isLoading: boolean;
    onApply: (id: string) => void;
    onUndo: (id: string) => void;
    onDiscard: (id: string) => void;
    onSendMessage: (id: string, text: string) => void;
    onSwitchPersona: (persona: PersonaId) => void;
    onClose: () => void;
}

/**
 * [Why/Intent] ユーザーが選択可能なペルソナの一覧定義（識別子と日本語ラベルのペア）。
 */
const PERSONA_OPTIONS: { id: PersonaId; label: string }[] = [
    { id: 'mentor', label: '初心者向けメンター' },
    { id: 'concise', label: 'シニア・コードオンリー' },
    { id: 'architect', label: '設計・アーキテクト' },
    { id: 'qa_security', label: 'デバッグ・品質特化' },
    { id: 'tutor', label: '思考促進チューター' },
];

/**
 * [Why/Intent] オンデマンドサイドパネルの右カラムUIコンポーネント。
 * ペルソナ選択ドロップダウン、チャット履歴リスト、アンドゥ/適用/却下ボタン、およびテキスト入力欄を統合管理する。
 */
export const ChatAndControlPanel: React.FC<ChatAndControlPanelProps> = ({
    detail,
    persona,
    isLoading,
    onApply,
    onUndo,
    onDiscard,
    onSendMessage,
    onSwitchPersona,
    onClose,
}) => {
    const [inputText, setInputText] = useState('');

    const isApplyEnabled = detail.status === 'pending' || detail.status === 'reverted';
    const isUndoEnabled = detail.status === 'applied';
    const isDiscardEnabled = detail.status !== 'dismissed';

    const handleSend = () => {
        if (!inputText.trim() || isLoading) {
            return;
        }
        onSendMessage(detail.id, inputText.trim());
        setInputText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Shift+Enter は改行を許容
                return;
            }
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div
            data-testid="chat-column"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                flex: '1 1 42%',
                minWidth: '280px',
                backgroundColor: 'var(--vscode-sideBar-background)',
                color: 'var(--vscode-foreground)',
                boxSizing: 'border-box',
            }}
        >
            {/* Header Area */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label htmlFor="persona-select" style={{ fontSize: '12px', fontWeight: 600 }}>
                        ペルソナ:
                    </label>
                    <select
                        id="persona-select"
                        aria-label="ペルソナ"
                        value={persona}
                        onChange={(e) => onSwitchPersona(e.target.value as PersonaId)}
                        style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--vscode-dropdown-background)',
                            color: 'var(--vscode-dropdown-foreground)',
                            border: '1px solid var(--vscode-dropdown-border)',
                            borderRadius: '3px',
                        }}
                    >
                        {PERSONA_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="閉じる"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--vscode-foreground)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '4px 8px',
                    }}
                >
                    ✖ 閉じる
                </button>
            </div>

            {/* Message List Area */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}
            >
                {detail.chatHistory?.map((msg) => (
                    <div
                        key={msg.id}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            lineHeight: '1.4',
                            backgroundColor:
                                msg.sender === 'user'
                                    ? 'var(--vscode-button-background)'
                                    : 'var(--vscode-editor-background)',
                            color:
                                msg.sender === 'user'
                                    ? 'var(--vscode-button-foreground)'
                                    : 'var(--vscode-editor-foreground)',
                            border: '1px solid var(--vscode-widget-border)',
                        }}
                    >
                        <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>
                            {msg.sender === 'user' ? '👤 ユーザー' : '🤖 AIアシスタント'}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</div>
                    </div>
                ))}
                {isLoading && (
                    <div
                        data-testid="chat-spinner"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            color: 'var(--vscode-descriptionForeground)',
                        }}
                    >
                        <span>⏳ AIが思考中...</span>
                    </div>
                )}
            </div>

            {/* Action Toolbar Area */}
            <div
                style={{
                    display: 'flex',
                    gap: '6px',
                    padding: '8px 12px',
                    borderTop: '1px solid var(--vscode-panel-border)',
                    backgroundColor: 'var(--vscode-editor-background)',
                }}
            >
                <button
                    type="button"
                    disabled={!isUndoEnabled}
                    onClick={() => onUndo(detail.id)}
                    style={{
                        flex: 1,
                        padding: '6px',
                        fontSize: '11px',
                        cursor: isUndoEnabled ? 'pointer' : 'not-allowed',
                        opacity: isUndoEnabled ? 1 : 0.5,
                        backgroundColor: 'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)',
                        border: 'none',
                        borderRadius: '3px',
                    }}
                >
                    ⏪ 提案を取り消す (アンドゥ)
                </button>
                <button
                    type="button"
                    disabled={!isApplyEnabled}
                    onClick={() => onApply(detail.id)}
                    style={{
                        flex: 1,
                        padding: '6px',
                        fontSize: '11px',
                        cursor: isApplyEnabled ? 'pointer' : 'not-allowed',
                        opacity: isApplyEnabled ? 1 : 0.5,
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '3px',
                    }}
                >
                    ⏩ この提案を適用する (復元)
                </button>
                <button
                    type="button"
                    disabled={!isDiscardEnabled}
                    onClick={() => onDiscard(detail.id)}
                    style={{
                        padding: '6px 10px',
                        fontSize: '11px',
                        cursor: isDiscardEnabled ? 'pointer' : 'not-allowed',
                        opacity: isDiscardEnabled ? 1 : 0.5,
                        backgroundColor: 'transparent',
                        color: 'var(--vscode-errorForeground)',
                        border: '1px solid var(--vscode-errorForeground)',
                        borderRadius: '3px',
                    }}
                >
                    🗑️ 提案を却下 (Dismiss)
                </button>
            </div>

            {/* Input Area */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '8px 12px',
                    borderTop: '1px solid var(--vscode-panel-border)',
                }}
            >
                <textarea
                    placeholder="AIと対話・追加指示を入力..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    style={{
                        resize: 'none',
                        padding: '6px 8px',
                        fontSize: '12px',
                        backgroundColor: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        borderRadius: '3px',
                    }}
                />
                <button
                    type="button"
                    disabled={isLoading || !inputText.trim()}
                    onClick={handleSend}
                    style={{
                        alignSelf: 'flex-end',
                        padding: '4px 16px',
                        fontSize: '12px',
                        cursor: isLoading || !inputText.trim() ? 'not-allowed' : 'pointer',
                        opacity: isLoading || !inputText.trim() ? 0.5 : 1,
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '3px',
                    }}
                >
                    送信
                </button>
            </div>
        </div>
    );
};

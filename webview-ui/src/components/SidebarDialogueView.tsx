/**
 * [Why/Intent] vibeCodeEase サイドバーの対話パネル画面コンポーネント。
 * 視認性を最優先し、「📝 変更理由（ペルソナ反映）」「🔍 変更差分（読み取り専用）」
 * 「💬 AI対話チャット（ペルソナ別の初手セリフ付き）」の3要素に整理して提供する。
 * 「✓ 採用」と「✕ 破棄」の2大アクションを直感的に提供し、
 * 採用後・破棄後でもいつでもあとからやり直せるモードを完全装備する。
 */
import React, { useState } from 'react';
import {
    PERSONA_OPTIONS,
    formatShortTitle,
    getPersonaOpeningLine,
    getStatusBadge,
} from '../constants/sidebarOptions';
import type {
    ChatMessage,
    InterventionDetail,
    PersonaId,
} from '../types/onDemandIntervention';
import { GithubDiffView } from './GithubDiffView';

/**
 * [Why/Intent] SidebarDialogueViewコンポーネントが要求するPropsインターフェース。
 */
export interface SidebarDialogueViewProps {
    detail: InterventionDetail;
    onBack: () => void;
    onRefine?: (instruction: string) => void;
    isRefining?: boolean;
    refineError?: string | null;
    onSendMessage: (text: string) => void;
    isChatLoading: boolean;
    onApply?: (id: string) => void;
    onUndo?: (id: string) => void;
    onReject: (id: string) => void;
    closeButtonLabel?: string;
}

/**
 * [Why/Intent] vibeCodeEase サイドバー対話パネル画面の実装。
 */
export const SidebarDialogueView: React.FC<SidebarDialogueViewProps> = ({
    detail,
    onBack,
    onSendMessage,
    isChatLoading,
    onApply,
    onReject,
    closeButtonLabel = '⬅️ 一覧・簡易設定に戻る',
}) => {
    const [chatInput, setChatInput] = useState('');

    /**
     * [Why/Intent] ユーザーのAI対話メッセージを送信する。送信後は入力フォームを即時クリアし、
     * AIの思考中（isChatLoading）は重複送信を防止する。
     */
    const handleChatSend = () => {
        if (!chatInput.trim() || isChatLoading) {
            return;
        }
        onSendMessage(chatInput.trim());
        setChatInput('');
    };

    const isApplied = detail.status === 'applied';
    const isDismissed = detail.status === 'dismissed' || detail.status === 'reverted';
    const statusBadge = getStatusBadge(detail.status);

    const getPersonaLabel = (id?: PersonaId) => {
        if (!id) {
            return 'AIアシスタント';
        }
        const found = PERSONA_OPTIONS.find((p) => p.id === id);
        return found ? found.label : `AI (${id})`;
    };

    // 初手のセリフ（初期AIメッセージ）が履歴先頭にない場合はペルソナに応じた初手セリフを自動補完する
    const rawHistory = detail.chatHistory ?? [];
    const hasInitialAiGreeting =
        rawHistory.length > 0 && rawHistory[0]?.sender === 'ai';
    const displayMessages: ChatMessage[] = hasInitialAiGreeting
        ? rawHistory
        : [
              {
                  id: `opening-${detail.id}-${detail.personaId}`,
                  sender: 'ai',
                  message: getPersonaOpeningLine(detail.personaId, detail.title),
                  timestamp: detail.createdAt || '',
                  personaId: detail.personaId,
              },
              ...rawHistory,
          ];

    return (
        <div
            data-testid="sidebar-dialogue-view"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                overflowX: 'hidden',
                overflowY: 'auto',
                padding: '12px',
                gap: '14px',
                color: 'var(--vscode-foreground)',
                fontSize: '13px',
            }}
        >
            {/* 最上部ヘッダー */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                    paddingBottom: '10px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                    }}
                >
                    <button
                        type="button"
                        data-testid="close-detail-pane-btn"
                        onClick={onBack}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--vscode-textLink-foreground)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            padding: '4px 0',
                            textAlign: 'left',
                        }}
                    >
                        {closeButtonLabel}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                            style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                backgroundColor:
                                    'var(--vscode-badge-background, rgba(128,128,128,0.2))',
                                color: 'var(--vscode-badge-foreground, inherit)',
                            }}
                        >
                            L{detail.range.start.line + 1} - L{detail.range.end.line + 1}
                        </span>

                        {/* 採用・破棄のやり直しトグルボタングループ */}
                        {isApplied ? (
                            <>
                                <button
                                    type="button"
                                    disabled
                                    data-testid="applied-status-btn"
                                    style={{
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'default',
                                        backgroundColor: 'rgba(78, 201, 176, 0.15)',
                                        color: 'var(--vscode-testing-iconPassed, #4ec9b0)',
                                        border: '1px solid var(--vscode-testing-iconPassed, #4ec9b0)',
                                        borderRadius: '4px',
                                    }}
                                >
                                    ✓ 採用中
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onReject(detail.id)}
                                    data-testid="rollback-to-discard-btn"
                                    style={{
                                        padding: '3px 9px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        backgroundColor: 'transparent',
                                        color: 'var(--vscode-errorForeground, #f48771)',
                                        border: '1px solid var(--vscode-errorForeground, #f48771)',
                                        borderRadius: '4px',
                                    }}
                                    title="コードを元に戻して破棄します"
                                >
                                    ✕ 破棄に戻す
                                </button>
                            </>
                        ) : isDismissed ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => onApply?.(detail.id)}
                                    data-testid="reapply-btn"
                                    style={{
                                        padding: '3px 9px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        backgroundColor: 'var(--vscode-button-background)',
                                        color: 'var(--vscode-button-foreground)',
                                        border: 'none',
                                        borderRadius: '4px',
                                    }}
                                    title="コードをエディタに適用して採用します"
                                >
                                    ✓ 採用し直す
                                </button>
                                <button
                                    type="button"
                                    disabled
                                    data-testid="discarded-status-btn"
                                    style={{
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'default',
                                        backgroundColor: 'rgba(244, 135, 113, 0.15)',
                                        color: 'var(--vscode-errorForeground, #f48771)',
                                        border: '1px solid var(--vscode-errorForeground, #f48771)',
                                        borderRadius: '4px',
                                    }}
                                >
                                    ✕ 破棄済
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => onApply?.(detail.id)}
                                    data-testid="apply-proposal-btn"
                                    style={{
                                        padding: '3px 9px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        backgroundColor: 'var(--vscode-button-background)',
                                        color: 'var(--vscode-button-foreground)',
                                        border: 'none',
                                        borderRadius: '4px',
                                    }}
                                    title="提案コードをエディタへ適用します"
                                >
                                    ✓ 採用
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onReject(detail.id)}
                                    data-testid="discard-proposal-btn"
                                    style={{
                                        padding: '3px 9px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        backgroundColor: 'transparent',
                                        color: 'var(--vscode-errorForeground, #f48771)',
                                        border: '1px solid var(--vscode-errorForeground, #f48771)',
                                        borderRadius: '4px',
                                    }}
                                    title="この提案を破棄します"
                                >
                                    ✕ 破棄
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                    }}
                >
                    <div
                        style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            lineHeight: 1.4,
                            textDecoration: isDismissed ? 'line-through' : 'none',
                            opacity: isDismissed ? 0.6 : 1,
                        }}
                    >
                        {formatShortTitle(detail.title)}
                    </div>
                    <span
                        style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            border: `1px solid ${statusBadge.color}`,
                            color: statusBadge.color,
                            flexShrink: 0,
                        }}
                    >
                        {statusBadge.label}
                    </span>
                </div>

                {/* 状態バナー（やり直し可能のガイド） */}
                {isApplied && (
                    <div
                        data-testid="applied-banner"
                        style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            backgroundColor: 'rgba(78, 201, 176, 0.12)',
                            border: '1px solid var(--vscode-testing-iconPassed, #4ec9b0)',
                            color: 'var(--vscode-testing-iconPassed, #4ec9b0)',
                        }}
                    >
                        ✅ この提案はエディタに採用されています。「✕ 破棄に戻す」を押すと元に戻せます。
                    </div>
                )}
                {isDismissed && (
                    <div
                        data-testid="dismissed-banner"
                        style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            backgroundColor: 'rgba(244, 135, 113, 0.12)',
                            border: '1px solid var(--vscode-errorForeground, #f48771)',
                            color: 'var(--vscode-errorForeground, #f48771)',
                        }}
                    >
                        ✕ この提案は破棄されています。「✓ 採用し直す」を押すといつでもエディタへ再適用できます。
                    </div>
                )}
            </div>

            {/* 📝 変更理由（サマリー） */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--vscode-editor-background, rgba(0, 0, 0, 0.15))',
                    borderRadius: '6px',
                    border: '1px solid var(--vscode-panel-border)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>
                        📝 変更理由
                    </span>
                    <span
                        style={{
                            fontSize: '11px',
                            opacity: 0.85,
                            color: 'var(--vscode-descriptionForeground)',
                        }}
                    >
                        {getPersonaLabel(detail.personaId)}
                    </span>
                </div>
                <div
                    style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                >
                    {detail.summary}
                </div>
            </div>

            {/* 🔍 差分（読み取り専用プレビュー） */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                }}
            >
                <div style={{ fontWeight: 600, fontSize: '12px' }}>
                    🔍 変更差分
                </div>
                <div
                    style={{
                        width: '100%',
                        overflowX: 'auto',
                        borderRadius: '6px',
                    }}
                >
                    <GithubDiffView
                        intervention={{
                            id: detail.id,
                            range: detail.range,
                            originalText: detail.originalCode,
                            replacementText: detail.proposedCode,
                            message: detail.summary,
                        }}
                        hideToolbar={true}
                        onApply={() => onApply?.(detail.id)}
                        onDiscard={() => onReject(detail.id)}
                    />
                </div>
            </div>

            {/* 💬 AIチャット */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    flex: 1,
                    minHeight: '220px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--vscode-editor-background, rgba(0, 0, 0, 0.15))',
                    borderRadius: '6px',
                    border: '1px solid var(--vscode-panel-border)',
                }}
            >
                <div style={{ fontWeight: 600, fontSize: '12px' }}>
                    💬 AIチャット（質問・相談）
                </div>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        flex: 1,
                        overflowY: 'auto',
                        padding: '4px 2px',
                    }}
                >
                    {displayMessages.map((msg) => (
                        <div
                            key={msg.id}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignSelf:
                                    msg.sender === 'user'
                                        ? 'flex-end'
                                        : 'flex-start',
                                maxWidth: '92%',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12.5px',
                                lineHeight: 1.55,
                                backgroundColor:
                                    msg.sender === 'user'
                                        ? 'var(--vscode-button-background)'
                                        : 'var(--vscode-sideBar-background)',
                                color:
                                    msg.sender === 'user'
                                        ? 'var(--vscode-button-foreground)'
                                        : 'var(--vscode-foreground)',
                                border: '1px solid var(--vscode-panel-border)',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '11px',
                                    opacity: 0.75,
                                    marginBottom: '4px',
                                    fontWeight: 500,
                                }}
                            >
                                {msg.sender === 'user'
                                    ? '👤 あなた'
                                    : `🤖 ${getPersonaLabel(msg.personaId ?? detail.personaId)}`}
                            </div>
                            <div
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {msg.message}
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div style={{ fontSize: '12px', opacity: 0.75 }}>
                            ⏳ AIが回答を作成中...
                        </div>
                    )}
                </div>

                <div
                    style={{
                        display: 'flex',
                        gap: '6px',
                        marginTop: 'auto',
                        paddingTop: '6px',
                        borderTop: '1px solid var(--vscode-panel-border)',
                    }}
                >
                    <input
                        type="text"
                        placeholder="この変更について質問や相談を入力..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleChatSend();
                            }
                        }}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '7px 10px',
                            fontSize: '12.5px',
                            backgroundColor: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '4px',
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleChatSend}
                        disabled={isChatLoading || !chatInput.trim()}
                        style={{
                            padding: '7px 14px',
                            fontSize: '12.5px',
                            fontWeight: 500,
                            backgroundColor: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            border: 'none',
                            borderRadius: '4px',
                            cursor:
                                isChatLoading || !chatInput.trim()
                                    ? 'not-allowed'
                                    : 'pointer',
                            opacity: isChatLoading || !chatInput.trim() ? 0.6 : 1,
                        }}
                    >
                        送信
                    </button>
                </div>
            </div>
        </div>
    );
};

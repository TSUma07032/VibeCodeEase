/**
 * [Why/Intent] vibeCodeEase サイドバーの対話パネル画面コンポーネント。
 * 選択された提案の変更理由（サマリー）、💡変更方針の修正（Refine）、Diffプレビュー、
 * AI対話チャット（ペルソナ履歴明記）、および操作ボタングループ（適用・アンドゥ・却下）を統合提供する。
 * 最上部に「⬅️ 一覧・簡易設定に戻る」ボタンを備え、初期画面へ即座に復帰可能。
 */
import React, { useState } from 'react';
import { PERSONA_OPTIONS } from '../constants/sidebarOptions';
import type {
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
    onRefine: (instruction: string) => void;
    isRefining: boolean;
    refineError?: string | null;
    onSendMessage: (text: string) => void;
    isChatLoading: boolean;
    onApply: (id: string) => void;
    onUndo: (id: string) => void;
    onReject: (id: string) => void;
}

/**
 * [Why/Intent] vibeCodeEase サイドバー対話パネル画面の実装。
 */
export const SidebarDialogueView: React.FC<SidebarDialogueViewProps> = ({
    detail,
    onBack,
    onRefine,
    isRefining,
    refineError,
    onSendMessage,
    isChatLoading,
    onApply,
    onUndo,
    onReject,
}) => {
    const [refineInstruction, setRefineInstruction] = useState('');
    const [chatInput, setChatInput] = useState('');

    /**
     * [Why/Intent] ユーザーが入力した方針修正指示（instruction）を親コンポーネントへ送信し、
     * LLMによる提案コードとサマリーの再生成（Refine）をトリガーする。再生成処理中（isRefining）は二重実行を抑止する。
     */
    const handleRefineSubmit = () => {
        if (!refineInstruction.trim() || isRefining) {
            return;
        }
        onRefine(refineInstruction.trim());
    };

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

    /**
     * [Why/Intent] 提案ライフサイクル状態遷移モデル（pending ➔ applied ⇄ reverted / dismissed）に基づく各ボタンの活性化ルール：
     * - isApplyEnabled: 未適用（pending）または一度取り消された（reverted）状態のみ適用可能。適用済（applied）や却下（dismissed）では無効化。
     * - isUndoEnabled: エディタへ適用完了（applied）している状態のみ元に戻す（アンドゥ）可能。
     * - isRejectEnabled: 明示的に却下（dismissed）されていない限り、いつでも却下して履歴から無効化可能。
     */
    const isApplyEnabled =
        detail.status === 'pending' || detail.status === 'reverted';
    const isUndoEnabled = detail.status === 'applied';
    const isRejectEnabled = detail.status !== 'dismissed';

    const getPersonaLabel = (id?: PersonaId) => {
        if (!id) {
            return 'AIアシスタント';
        }
        const found = PERSONA_OPTIONS.find((p) => p.id === id);
        return found ? found.label : `AI (${id})`;
    };

    return (
        <div
            data-testid="sidebar-dialogue-view"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                boxSizing: 'border-box',
                overflowX: 'hidden',
                overflowY: 'auto',
                padding: '12px',
                gap: '14px',
                color: 'var(--vscode-foreground)',
                fontSize: '12px',
            }}
        >
            {/* 最上部ヘッダー */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                    paddingBottom: '8px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--vscode-textLink-foreground)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '4px 0',
                            textAlign: 'left',
                        }}
                    >
                        ⬅️ 一覧・簡易設定に戻る
                    </button>
                    <span style={{ fontSize: '11px', opacity: 0.7 }}>
                        L{detail.range.start.line + 1} - L
                        {detail.range.end.line + 1}
                    </span>
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    {detail.title}
                </div>
            </div>

            {/* 📝 変更理由（サマリー） */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '8px 10px',
                    backgroundColor: 'var(--vscode-sideBar-background)',
                    borderRadius: '4px',
                    border: '1px solid var(--vscode-panel-border)',
                }}
            >
                <div
                    style={{ fontWeight: 600, fontSize: '11px', opacity: 0.8 }}
                >
                    📝 変更理由
                </div>
                <div style={{ lineHeight: 1.4 }}>{detail.summary}</div>
            </div>

            {/* 💡 変更方針の修正 (Refine) */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '10px',
                    backgroundColor: 'var(--vscode-sideBar-background)',
                    borderRadius: '4px',
                    border: '1px solid var(--vscode-panel-border)',
                }}
            >
                <div style={{ fontWeight: 600 }}>💡 変更方針の修正</div>
                {refineError && (
                    <div
                        style={{
                            padding: '6px 8px',
                            fontSize: '11px',
                            color: 'var(--vscode-errorForeground)',
                            backgroundColor: 'rgba(255, 0, 0, 0.1)',
                            borderRadius: '3px',
                            border: '1px solid var(--vscode-errorForeground)',
                        }}
                    >
                        ⚠️ {refineError}
                    </div>
                )}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                    }}
                >
                    <input
                        type="text"
                        placeholder="こういう方向で変えて？"
                        value={refineInstruction}
                        onChange={(e) => setRefineInstruction(e.target.value)}
                        disabled={isRefining}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleRefineSubmit();
                            }
                        }}
                        style={{
                            padding: '6px 8px',
                            backgroundColor: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '3px',
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleRefineSubmit}
                        disabled={isRefining || !refineInstruction.trim()}
                        style={{
                            alignSelf: 'flex-start',
                            padding: '5px 12px',
                            backgroundColor:
                                'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: 'none',
                            borderRadius: '3px',
                            cursor:
                                isRefining || !refineInstruction.trim()
                                    ? 'not-allowed'
                                    : 'pointer',
                            opacity:
                                isRefining || !refineInstruction.trim()
                                    ? 0.6
                                    : 1,
                        }}
                    >
                        {isRefining
                            ? '🔄 再生成中...'
                            : '🔄 この方針でコードを再生成'}
                    </button>
                </div>
            </div>

            {/* 🔍 Diffプレビュー */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                }}
            >
                <div style={{ fontWeight: 600, fontSize: '12px' }}>
                    🔍 差分プレビュー
                </div>
                <div
                    style={{
                        width: '100%',
                        overflowX: 'auto',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: '4px',
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
                        onApply={() => onApply(detail.id)}
                        onDiscard={() => onReject(detail.id)}
                    />
                </div>
            </div>

            {/* 🎛️ 操作ボタングループ */}
            <div
                style={{
                    display: 'flex',
                    gap: '6px',
                    padding: '8px 0',
                    borderTop: '1px solid var(--vscode-panel-border)',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                }}
            >
                <button
                    type="button"
                    disabled={!isUndoEnabled}
                    onClick={() => onUndo(detail.id)}
                    style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '11px',
                        cursor: isUndoEnabled ? 'pointer' : 'not-allowed',
                        opacity: isUndoEnabled ? 1 : 0.5,
                        backgroundColor:
                            'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)',
                        border: 'none',
                        borderRadius: '3px',
                    }}
                >
                    ⏪ アンドゥ
                </button>
                <button
                    type="button"
                    disabled={!isApplyEnabled}
                    onClick={() => onApply(detail.id)}
                    style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '11px',
                        cursor: isApplyEnabled ? 'pointer' : 'not-allowed',
                        opacity: isApplyEnabled ? 1 : 0.5,
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '3px',
                    }}
                >
                    ⏩ 適用
                </button>
                <button
                    type="button"
                    disabled={!isRejectEnabled}
                    onClick={() => onReject(detail.id)}
                    style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        cursor: isRejectEnabled ? 'pointer' : 'not-allowed',
                        opacity: isRejectEnabled ? 1 : 0.5,
                        backgroundColor: 'transparent',
                        color: 'var(--vscode-errorForeground)',
                        border: '1px solid var(--vscode-errorForeground)',
                        borderRadius: '3px',
                    }}
                >
                    🗑️ 却下
                </button>
            </div>

            {/* 💬 AIチャット */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    flex: 1,
                    minHeight: '180px',
                }}
            >
                <div style={{ fontWeight: 600, fontSize: '12px' }}>
                    💬 AI対話・質疑応答
                </div>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        padding: '4px',
                    }}
                >
                    {detail.chatHistory?.map((msg) => (
                        <div
                            key={msg.id}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignSelf:
                                    msg.sender === 'user'
                                        ? 'flex-end'
                                        : 'flex-start',
                                maxWidth: '90%',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
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
                                    fontSize: '10px',
                                    opacity: 0.7,
                                    marginBottom: '2px',
                                }}
                            >
                                {msg.sender === 'user'
                                    ? '👤 あなた'
                                    : `🤖 ${getPersonaLabel(msg.personaId)}`}
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap' }}>
                                {msg.message}
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div style={{ fontSize: '11px', opacity: 0.7 }}>
                            ⏳ AIが回答を作成中...
                        </div>
                    )}
                </div>

                <div
                    style={{
                        display: 'flex',
                        gap: '6px',
                        marginTop: 'auto',
                    }}
                >
                    <input
                        type="text"
                        placeholder="質問や相談を入力..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleChatSend();
                            }
                        }}
                        style={{
                            flex: 1,
                            padding: '6px 8px',
                            backgroundColor: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '3px',
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleChatSend}
                        disabled={isChatLoading || !chatInput.trim()}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            border: 'none',
                            borderRadius: '3px',
                            cursor:
                                isChatLoading || !chatInput.trim()
                                    ? 'not-allowed'
                                    : 'pointer',
                        }}
                    >
                        送信
                    </button>
                </div>
            </div>
        </div>
    );
};

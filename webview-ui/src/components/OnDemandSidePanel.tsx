/**
 * [Why/Intent] オンデマンド展開されたWebviewサイドパネルの最上位コンポーネント。
 * 左カラム（GithubDiffView）と右カラム（ChatAndControlPanel）の2カラムレイアウトを提供する。
 */
import React from 'react';
import type { WebviewIntervention } from '../types';
import type { InterventionDetail, PersonaId } from '../types/onDemandIntervention';
import { ChatAndControlPanel } from './ChatAndControlPanel';
import { GithubDiffView } from './GithubDiffView';

/**
 * [Why/Intent] OnDemandSidePanelコンポーネントへ親（App）から渡されるプロパティ定義。
 * 表示対象の介入詳細、選択中ペルソナ、チャット通信ローディング状態、および各操作（適用・アンドゥ・却下・メッセージ送信・ペルソナ切替・閉じる）コールバックを提供する。
 */
export interface OnDemandSidePanelProps {
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
 * [Why/Intent] オンデマンド展開されたWebviewサイドパネルの最上位ルートコンポーネント。
 * 左カラムの差分表示（GithubDiffView）と右カラムの対話操作パネル（ChatAndControlPanel）を左右2カラムで統合描画する。
 */
export const OnDemandSidePanel: React.FC<OnDemandSidePanelProps> = ({
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
    const diffIntervention: WebviewIntervention = {
        id: detail.id,
        range: detail.range,
        originalText: detail.originalCode,
        replacementText: detail.proposedCode,
        message: detail.summary,
    };

    return (
        <div
            data-testid="on-demand-side-panel"
            style={{
                display: 'flex',
                flexDirection: 'row',
                height: '100vh',
                width: '100vw',
                overflow: 'hidden',
                backgroundColor: 'var(--vscode-editor-background)',
                color: 'var(--vscode-foreground)',
            }}
        >
            <div
                data-testid="diff-column"
                style={{
                    flex: '1 1 58%',
                    minWidth: '320px',
                    borderRight: '1px solid var(--vscode-panel-border)',
                    overflowY: 'auto',
                    padding: '12px',
                    boxSizing: 'border-box',
                }}
            >
                <div
                    style={{
                        marginBottom: '12px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                    }}
                >
                    {detail.title}
                </div>
                <GithubDiffView
                    intervention={diffIntervention}
                    onApply={() => onApply(detail.id)}
                    onDiscard={() => onDiscard(detail.id)}
                />
            </div>
            <ChatAndControlPanel
                detail={detail}
                persona={persona}
                isLoading={isLoading}
                onApply={onApply}
                onUndo={onUndo}
                onDiscard={onDiscard}
                onSendMessage={onSendMessage}
                onSwitchPersona={onSwitchPersona}
                onClose={onClose}
            />
        </div>
    );
};

/**
 * [Why/Intent] GitHub風Unified Diffビューを描画し、AI推敲提案のインライン確認・採用・破棄・理由開閉を提供するコンポーネント。
 * エディタ行とシームレスに調和する左揃えツールバー、理由アコーディオン、赤（削除）/緑（追加）の差分行を描画する。
 */
import React, { useState } from 'react';
import type { WebviewIntervention } from '../types';

/**
 * [Why/Intent] GitHub風Unified Diffビューを描画し、AI推敲提案のインライン確認・採用・破棄・理由開閉を提供するProps。
 * 親コンポーネント（MirrorEditor）から介入メタデータおよびコールバックを受け取る。
 */
export interface GithubDiffViewProps {
    /** [Why/Intent] 変更前後のテキスト、置換範囲、推敲理由を含むAI介入オブジェクト */
    intervention: WebviewIntervention;
    /** [Why/Intent] 提案を採用し、Extensionへコード適用を要求するコールバック */
    onApply: (intervention: WebviewIntervention) => void;
    /** [Why/Intent] 提案を破棄し、Extensionへ除外を要求するコールバック */
    onDiscard: (id: string) => void;
}

/**
 * [Why/Intent] GitHub風Unified Diffビュー本体。左揃えツールバー、理由展開アコーディオン、
 * 削除行（-赤）と追加行（+緑）をインライン描画する。
 */
export const GithubDiffView: React.FC<GithubDiffViewProps> = ({ intervention, onApply, onDiscard }) => {
    /** [Why/Intent] 推敲理由詳細パネルの開閉状態を管理するローカルstate */
    const [isReasonExpanded, setIsReasonExpanded] = useState<boolean>(false);

    const startLineNum = intervention.range.start.line + 1;
    const oldLines = intervention.originalText ? intervention.originalText.split(/\r?\n/) : [];
    const newLines = intervention.replacementText ? intervention.replacementText.split(/\r?\n/) : [];

    return (
        <div
            data-testid={`github-diff-view-${intervention.id}`}
            role="region"
            aria-label="AIコード変更提案"
            style={{
                display: 'flex',
                flexDirection: 'column',
                margin: '8px 0',
                border: '1px solid var(--vscode-editorGroup-border, #30363d)',
                borderRadius: '6px',
                backgroundColor: 'var(--vscode-editor-background)',
                overflow: 'hidden',
                fontFamily: 'monospace',
                fontSize: '14px',
                lineHeight: '1.5'
            }}
        >
            {/* ツールバー（左揃え） */}
            <div
                data-testid="diff-toolbar"
                style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    backgroundColor: 'var(--vscode-editorGroupHeader-tabsBackground, rgba(128, 128, 128, 0.1))',
                    borderBottom: '1px solid var(--vscode-editorGroup-border, #30363d)'
                }}
            >
                <button
                    data-testid="diff-accept-btn"
                    aria-label="採用"
                    onClick={() => onApply(intervention)}
                    style={{
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    [採用]
                </button>
                <button
                    data-testid="diff-discard-btn"
                    aria-label="破棄"
                    onClick={() => onDiscard(intervention.id)}
                    style={{
                        backgroundColor: 'transparent',
                        color: 'var(--vscode-button-foreground)',
                        border: '1px solid var(--vscode-button-background)',
                        borderRadius: '3px',
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    [破棄]
                </button>
                <button
                    data-testid="diff-reason-toggle-btn"
                    aria-label={isReasonExpanded ? '理由を閉じる' : '理由を確認'}
                    aria-expanded={isReasonExpanded}
                    aria-controls={`diff-reason-${intervention.id}`}
                    onClick={() => setIsReasonExpanded(prev => !prev)}
                    style={{
                        backgroundColor: 'transparent',
                        color: 'var(--vscode-descriptionForeground, #888)',
                        border: '1px solid var(--vscode-editorGroup-border, #444)',
                        borderRadius: '3px',
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    {isReasonExpanded ? '[ 理由を閉じる ▴ ]' : '[ 理由を確認 ▾ ]'}
                </button>
            </div>

            {/* 理由エリア */}
            {isReasonExpanded && (
                <div
                    id={`diff-reason-${intervention.id}`}
                    data-testid="diff-reason-content"
                    style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderBottom: '1px solid var(--vscode-editorGroup-border, #30363d)',
                        fontFamily: 'sans-serif',
                        fontSize: '13px'
                    }}
                >
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--vscode-editor-foreground)' }}>
                        【推敲理由】
                    </div>
                    <div style={{ color: 'var(--vscode-descriptionForeground, #aaa)', whiteSpace: 'pre-wrap' }}>
                        {intervention.message}
                    </div>
                </div>
            )}

            {/* 削除行（Red） */}
            {oldLines.map((lineText, lineIdx) => (
                <div
                    key={`del-${lineIdx}`}
                    data-diff-type="deletion"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(248, 81, 73, 0.15)',
                        borderLeft: '4px solid #f44336',
                        minHeight: '21px'
                    }}
                >
                    <div
                        style={{
                            width: '45px',
                            textAlign: 'right',
                            paddingRight: '10px',
                            color: 'rgba(248, 81, 73, 0.8)',
                            userSelect: 'none',
                            flexShrink: 0
                        }}
                    >
                        {startLineNum + lineIdx} -
                    </div>
                    <div
                        style={{
                            flexGrow: 1,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            color: 'var(--vscode-editor-foreground)'
                        }}
                    >
                        - {lineText === '' ? ' ' : lineText}
                    </div>
                </div>
            ))}

            {/* 追加行（Green） */}
            {newLines.map((lineText, lineIdx) => (
                <div
                    key={`add-${lineIdx}`}
                    data-diff-type="addition"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(46, 160, 67, 0.15)',
                        borderLeft: '4px solid #4caf50',
                        minHeight: '21px'
                    }}
                >
                    <div
                        style={{
                            width: '45px',
                            textAlign: 'right',
                            paddingRight: '10px',
                            color: 'rgba(46, 160, 67, 0.8)',
                            userSelect: 'none',
                            flexShrink: 0
                        }}
                    >
                        {startLineNum + lineIdx} +
                    </div>
                    <div
                        style={{
                            flexGrow: 1,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            color: 'var(--vscode-editor-foreground)'
                        }}
                    >
                        + {lineText === '' ? ' ' : lineText}
                    </div>
                </div>
            ))}
        </div>
    );
};

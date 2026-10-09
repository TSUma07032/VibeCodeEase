/**
 * [Why/Intent] 仕様上の要件であり、エディタとしての過剰な依存を排除して軽量かつ安定したミラー表示を実現するため、
 * シンタックスハイライトを行わずプレーンテキストで行番号付きで描画するコンポーネント。
 */
import React, { useState, useMemo } from 'react';
import type { WebviewIntervention } from '../types';
import { ProposalPopup } from './ProposalPopup';

interface MirrorEditorProps {
    text: string;
    interventions: WebviewIntervention[];
    onApply: (intervention: WebviewIntervention) => void;
    onDiscard: (id: string) => void;
}

export const MirrorEditor: React.FC<MirrorEditorProps> = ({ text, interventions, onApply, onDiscard }) => {
    const lines = text.split('\n');
    
    /**
     * [Why/Intent] 行ごとに複数の提案が存在したり、ユーザーが個別に開閉状態を維持できるようにするため、
     * 単一のIDではなく Set<string> で管理する。
     */
    const [openPopupIds, setOpenPopupIds] = useState<Set<string>>(new Set());

    const interventionsByLine = useMemo(() => {
        const map = new Map<number, WebviewIntervention[]>();
        for (const intervention of interventions) {
            const line = intervention.range.start.line;
            if (!map.has(line)) map.set(line, []);
            map.get(line)!.push(intervention);
        }
        return map;
    }, [interventions]);

    /**
     * [Why/Intent] ポップアップを開閉し、提案の詳細を確認できるようにする。
     */
    const togglePopup = (id: string) => {
        setOpenPopupIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    /**
     * [Why/Intent] コード適用をExtensionに要求し、完了を見越してポップアップを閉じることでスムーズなUXを提供する。
     */
    const handleApply = (intervention: WebviewIntervention) => {
        onApply(intervention);
        setOpenPopupIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(intervention.id);
            return newSet;
        });
    };

    /**
     * [Why/Intent] 提案を破棄する要求をExtensionへ送り、不要になったポップアップを閉じる。
     */
    const handleDiscard = (id: string) => {
        onDiscard(id);
        setOpenPopupIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    };

    return (
        <div style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.5',
            backgroundColor: 'var(--vscode-editor-background)',
            color: 'var(--vscode-editor-foreground)',
            padding: '10px'
        }}>
            {lines.map((lineContent, index) => {
                const lineNumber = index; // 0-indexed internally, display as 1-indexed
                
                // [Why/Intent] その行に関連する提案が存在する場合にのみ電球アイコンを描画し、ユーザーが提案に気づけるようにする。
                const lineInterventions = interventionsByLine.get(lineNumber) || [];
                const hasIntervention = lineInterventions.length > 0;

                return (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            minHeight: '21px',
                            backgroundColor: hasIntervention ? 'rgba(255, 255, 0, 0.05)' : 'transparent'
                        }}>
                            <div style={{
                                width: '40px',
                                textAlign: 'right',
                                paddingRight: '10px',
                                color: '#858585',
                                userSelect: 'none',
                                flexShrink: 0
                            }}>
                                {lineNumber + 1}
                            </div>
                            <div style={{
                                flexGrow: 1,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all'
                            }}>
                                {lineContent === '' ? ' ' : lineContent}
                            </div>
                            {hasIntervention && (
                                <div style={{ flexShrink: 0, paddingLeft: '8px' }}>
                                    {lineInterventions.map(intervention => (
                                        <button
                                            key={intervention.id}
                                            onClick={() => togglePopup(intervention.id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '16px',
                                                padding: '0 4px',
                                                lineHeight: '1'
                                            }}
                                            title="View AI Proposal"
                                        >
                                            💡
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Inline Proposal Popup */}
                        {lineInterventions.map(intervention => {
                            if (openPopupIds.has(intervention.id)) {
                                return (
                                    <ProposalPopup
                                        key={`popup-${intervention.id}`}
                                        intervention={intervention}
                                        onApply={handleApply}
                                        onDiscard={handleDiscard}
                                    />
                                );
                            }
                            return null;
                        })}
                    </div>
                );
            })}
        </div>
    );
};

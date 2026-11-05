/**
 * [Why/Intent] 仕様上の要件であり、エディタとしての過剰な依存を排除して軽量かつ安定したミラー表示を実現するため、
 * シンタックスハイライトを行わずプレーンテキストで行番号付きで描画するコンポーネント。
 * AI推敲提案が存在する行範囲をスキップし、GitHub風Diffビュー（GithubDiffView）をインライン置換描画する。
 */
import React from 'react';
import type { WebviewIntervention } from '../types';
import { GithubDiffView } from './GithubDiffView';

/**
 * [Why/Intent] MirrorEditor へ親（App）から渡されるProps。
 * アクティブエディタのテキストおよび最新の推敲提案群を受け取り、
 * インライン差分置換描画とユーザー操作（採用・破棄）のExtension伝搬を仲介する。
 */
export interface MirrorEditorProps {
    /** [Why/Intent] アクティブエディタの最新状態をミラー表示し、行ごとの差分置換走査を行うための全文ソースコード */
    text: string;
    /** [Why/Intent] 通常行描画をスキップしてGithubDiffViewをインライン置換描画するためのAI推敲提案リスト */
    interventions: WebviewIntervention[];
    /** [Why/Intent] ユーザーが推敲提案を採用した際に、親（App/Extension）へコード反映を要求するコールバック */
    onApply: (intervention: WebviewIntervention) => void;
    /** [Why/Intent] ユーザーが推敲提案を破棄した際に、親（App/Extension）へ提案除外を要求するコールバック */
    onDiscard: (id: string) => void;
}

/**
 * [Why/Intent] 提案が存在しない通常の行をプレーンテキストで行番号付きで描画するヘルパー。
 * 差分ビューの行番号幅（45px）と同一に揃えて視覚的なズレを防ぐ。
 */
const renderNormalLine = (lineContent: string, lineIndex: number): React.ReactNode => (
    <div key={`line-${lineIndex}`} style={{ display: 'flex', alignItems: 'center', minHeight: '21px' }}>
        <div style={{
            width: '45px',
            textAlign: 'right',
            paddingRight: '10px',
            color: 'var(--vscode-editorLineNumber-foreground, #858585)',
            userSelect: 'none',
            flexShrink: 0
        }}>
            {lineIndex + 1}
        </div>
        <div style={{
            flexGrow: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: 'var(--vscode-editor-foreground)'
        }}>
            {lineContent === '' ? ' ' : lineContent}
        </div>
    </div>
);

/**
 * [Why/Intent] MirrorEditor 本体コンポーネント。通常行の描画と介入行のインライン差分置換描画を統合制御する。
 */
export const MirrorEditor: React.FC<MirrorEditorProps> = ({ text, interventions, onApply, onDiscard }) => {
    const lines = text.split(/\r?\n/);

    // 1. interventions を range.start.line 昇順にソート
    const sortedInterventions = [...interventions].sort((a, b) => a.range.start.line - b.range.start.line);

    // 2. start.line をキーとする Map を作成
    const interventionsByStartLine = new Map<number, WebviewIntervention[]>();
    for (const intervention of sortedInterventions) {
        const startLine = intervention.range.start.line;
        if (!interventionsByStartLine.has(startLine)) {
            interventionsByStartLine.set(startLine, []);
        }
        interventionsByStartLine.get(startLine)!.push(intervention);
    }

    // 3. 行を走査し、介入開始行の場合は差分ビューを描画して該当行範囲をスキップ
    const renderedElements: React.ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
        if (interventionsByStartLine.has(i)) {
            const lineInterventions = interventionsByStartLine.get(i)!;
            for (const intervention of lineInterventions) {
                renderedElements.push(
                    <GithubDiffView
                        key={`diff-${intervention.id}`}
                        intervention={intervention}
                        onApply={onApply}
                        onDiscard={onDiscard}
                    />
                );
            }
            // 該当介入の最大終了行を算出して通常行のレンダリングをスキップ
            const maxEndLine = Math.max(...lineInterventions.map(intv => intv.range.end.line));
            i = Math.max(i + 1, maxEndLine + 1);
        } else {
            // 通常のエディタ行を描画
            renderedElements.push(renderNormalLine(lines[i], i));
            i++;
        }
    }

    return (
        <div style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.5',
            backgroundColor: 'var(--vscode-editor-background)',
            color: 'var(--vscode-editor-foreground)',
            padding: '10px'
        }}>
            {renderedElements}
        </div>
    );
};

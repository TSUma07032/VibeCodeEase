/**
 * [Why/Intent] メインエディタ上の薄いヒートマップ装飾およびアイコン（Gutter/行末）の
 * TextEditorDecorationType管理を行うデコレータ。
 */
import * as vscode from 'vscode';
import type { InterventionItem } from '../../types/onDemandIntervention';

/**
 * [Why/Intent] エディタ装飾の各カテゴリ（ヒートマップ、Pendingアイコン、Appliedアイコン、行末テキスト）ごとの計算済みRange情報。
 */
export interface CalculatedDecorations {
    heatmapRanges: vscode.Range[];
    gutterPendingRanges: vscode.Range[];
    gutterAppliedRanges: vscode.Range[];
    afterTextRanges: vscode.DecorationOptions[];
}

/**
 * [Why/Intent] メインエディタへの非侵襲な視覚フィードバック（薄い黄色ヒートマップ、電球アイコン、適用チェックマーク、行末テキスト）の
 * 生成・更新・クリーンアップを統括するデコレータクラス。
 */
export class InlineInterventionDecorator implements vscode.Disposable {
    private readonly heatmapType: vscode.TextEditorDecorationType;
    private readonly gutterPendingType: vscode.TextEditorDecorationType;
    private readonly gutterAppliedType: vscode.TextEditorDecorationType;
    private readonly afterTextType: vscode.TextEditorDecorationType;

    public constructor() {
        this.heatmapType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            overviewRulerColor: 'rgba(255, 193, 7, 0.7)',
            dark: {
                backgroundColor: 'rgba(255, 193, 7, 0.12)',
            },
            light: {
                backgroundColor: 'rgba(255, 193, 7, 0.20)',
            },
        });

        const pendingSvg =
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="13" font-size="12">💡</text></svg>';
        this.gutterPendingType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse(pendingSvg),
            gutterIconSize: 'contain',
        });

        const appliedSvg =
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" opacity="0.35"><text y="13" font-size="12" fill="%234caf50">✓</text></svg>';
        this.gutterAppliedType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse(appliedSvg),
            gutterIconSize: 'contain',
        });

        this.afterTextType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' 💬 提案あり',
                color: 'rgba(255, 255, 255, 0.45)',
            },
        });
    }

    /**
     * [Why/Intent] 介入リストの各ステータス（pending/applied/reverted/dismissed）を解析し、
     * エディタへ適用すべき各装飾のRange配列を純粋計算する。
     */
    public computeDecorations(interventions: InterventionItem[]): CalculatedDecorations {
        const heatmapRanges: vscode.Range[] = [];
        const gutterPendingRanges: vscode.Range[] = [];
        const gutterAppliedRanges: vscode.Range[] = [];
        const afterTextRanges: vscode.DecorationOptions[] = [];

        for (const item of interventions) {
            const startPos = new vscode.Position(item.range.start.line, item.range.start.character);
            const endPos = new vscode.Position(item.range.end.line, item.range.end.character);
            const range = new vscode.Range(startPos, endPos);

            if (item.status === 'pending' || item.status === 'reverted') {
                heatmapRanges.push(range);
                gutterPendingRanges.push(range);
                afterTextRanges.push({
                    range: new vscode.Range(endPos, endPos),
                    renderOptions: {
                        after: {
                            contentText: ' 💬 提案あり',
                            color: 'rgba(255, 255, 255, 0.45)',
                        },
                    },
                });
            } else if (item.status === 'applied') {
                gutterAppliedRanges.push(range);
            }
        }

        return {
            heatmapRanges,
            gutterPendingRanges,
            gutterAppliedRanges,
            afterTextRanges,
        };
    }

    /**
     * [Why/Intent] 計算された各装飾タイプを対象TextEditorへ一括適用し、エディタ上のインライン表示を更新する。
     */
    public updateDecorations(editor: vscode.TextEditor, interventions: InterventionItem[]): void {
        const dec = this.computeDecorations(interventions);
        editor.setDecorations(this.heatmapType, dec.heatmapRanges);
        editor.setDecorations(this.gutterPendingType, dec.gutterPendingRanges);
        editor.setDecorations(this.gutterAppliedType, dec.gutterAppliedRanges);
        editor.setDecorations(this.afterTextType, dec.afterTextRanges);
    }

    /**
     * [Why/Intent] 対象TextEditorからすべてのインライン装飾を消去する。
     */
    public clearDecorations(editor: vscode.TextEditor): void {
        editor.setDecorations(this.heatmapType, []);
        editor.setDecorations(this.gutterPendingType, []);
        editor.setDecorations(this.gutterAppliedType, []);
        editor.setDecorations(this.afterTextType, []);
    }

    /**
     * [Why/Intent] 登録済みのTextEditorDecorationTypeリソースを安全に破棄し、メモリリークを防止する。
     */
    public dispose(): void {
        this.heatmapType.dispose();
        this.gutterPendingType.dispose();
        this.gutterAppliedType.dispose();
        this.afterTextType.dispose();
    }
}

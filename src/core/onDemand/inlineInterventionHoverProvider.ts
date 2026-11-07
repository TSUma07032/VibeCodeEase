/**
 * [Why/Intent] 介入行へのホバー時にMarkdownツールチップ（目次サマリー＋配列エンコードURIコマンドリンク）を
 * 提供するHoverProvider。
 */
import * as vscode from 'vscode';
import type { InterventionHistoryStore } from './interventionHistoryStore';

/**
 * [Why/Intent] エディタ上の介入提案対象行にカーソルを合わせた際、
 * Markdown形式のサマリー掲示板とコマンドリンク（詳細展開 / 却下）を提供するホバープロバイダ。
 */
export class InlineInterventionHoverProvider implements vscode.HoverProvider {
    public constructor(readonly _historyStore: InterventionHistoryStore) {}

    /**
     * [Why/Intent] カーソル位置の行番号に合致する未却下提案を抽出し、
     * コマンド引数を安全にJSON配列エンコードしたMarkdownStringホバーを構築して返却する。
     */
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.Hover> {
        const interventions = this._historyStore.getInterventions(document.uri.toString());
        const matching = interventions.filter(
            (item) =>
                item.status !== 'dismissed' &&
                position.line >= item.range.start.line &&
                position.line <= item.range.end.line,
        );

        if (matching.length === 0) {
            return undefined;
        }

        const mdLines: string[] = [
            `### $(sparkle) vibeCodeEase: AI介入提案 (${matching.length}件)`,
        ];

        matching.forEach((item, index) => {
            const encodedArg = encodeURIComponent(JSON.stringify([item.id]));
            mdLines.push('---');
            mdLines.push(`**${index + 1}. ${item.title}**  `);
            mdLines.push(`${item.summary}  `);
            mdLines.push(
                `$(diff-multiple) [詳細差分と対話を展開](command:vibecodeease.expandIntervention?${encodedArg})`,
            );
            mdLines.push('');
            mdLines.push(
                `$(trash) [この提案を却下する](command:vibecodeease.discardIntervention?${encodedArg})`,
            );
        });

        const md = new vscode.MarkdownString(mdLines.join('\n'));
        md.isTrusted = true;
        md.supportHtml = true;
        md.supportThemeIcons = true;

        return new vscode.Hover(md);
    }
}

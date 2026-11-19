/**
 * [Why/Intent] 介入行へのホバー時にMarkdownツールチップ（過去の介入も含む掲示板形式のトグルリスト）を
 * 提供するHoverProvider。
 * 各項目「介入N：要約」をクリックすると <details> トグルが開き、
 * before (- 行) / after (+ 行) の差分および「採用」「却下」「詳細」アクションリンクを表示する。
 * 「詳細」を押した際には、常に一番上の介入案ではなく、その時押した介入IDのチャット画面を確実に開く。
 */
import * as vscode from 'vscode';
import type { InterventionDetail, InterventionStatus } from '../../types/onDemandIntervention';
import { formatInterventionOneLiner } from '../llm/promptBuilder';
import type { InterventionHistoryStore } from './interventionHistoryStore';

/**
 * [Why/Intent] 介入ステータスに対応する日本語ラベルを返却するヘルパー。
 * 過去の介入（採用済・破棄済）も含めて掲示板上で一目で状態を判別できるようにする。
 */
function getHoverStatusLabel(status: InterventionStatus): string {
    switch (status) {
        case 'applied':
            return '✓ 採用済';
        case 'reverted':
        case 'dismissed':
            return '✕ 却下済';
        case 'pending':
            return '💡 未対応';
    }
}

/**
 * [Why/Intent] コード文字列を行単位に分割し、diff用のプレフィックス（- または +）を付与した整形文字列を生成する。
 */
function formatDiffLines(code: string | undefined, prefix: '-' | '+'): string {
    const raw = (code ?? '').trimEnd();
    if (!raw) {
        return `${prefix} (変更なし)`;
    }
    return raw
        .split(/\r?\n/)
        .map((line) => `${prefix} ${line}`)
        .join('\n');
}

/**
 * [Why/Intent] 単一の介入アイテムを <details>/<summary> トグル形式のMarkdownブロックへ変換する。
 * トグル見出しには「介入N：要約」を表示し、展開時に before / after 差分と「採用・却下・詳細」リンクを表示する。
 */
function buildInterventionToggleMarkdown(
    item: InterventionDetail,
    index: number,
    docUri: string,
): string {
    const encodedArg = encodeURIComponent(JSON.stringify([item.id, docUri]));
    const conciseTitle = formatInterventionOneLiner(item.title);
    const startLine = item.range.start.line + 1;
    const endLine = item.range.end.line + 1;
    const lineLabel = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
    const statusLabel = getHoverStatusLabel(item.status);
    const summaryLine = item.summary.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';

    const beforeDiff = formatDiffLines(item.originalCode, '-');
    const afterDiff = formatDiffLines(item.proposedCode, '+');

    const lines: string[] = [
        '<details>',
        `<summary><b>介入${index + 1}：${conciseTitle}</b> <code>(${lineLabel})</code> <span>[${statusLabel}]</span></summary>`,
        '',
    ];

    if (summaryLine) {
        lines.push(`${summaryLine}  `);
    }

    lines.push(
        '**before**',
        '```diff',
        beforeDiff,
        '```',
        '**after**',
        '```diff',
        afterDiff,
        '```',
        `[採用](command:vibecodeease.applyInterventionById?${encodedArg}) &nbsp;｜&nbsp; [却下](command:vibecodeease.dismissIntervention?${encodedArg}) &nbsp;｜&nbsp; [詳細](command:vibecodeease.expandIntervention?${encodedArg})`,
        '',
        '</details>',
    );

    return lines.join('\n');
}

/**
 * [Why/Intent] エディタ上の介入提案対象行にカーソルを合わせた際、
 * 過去の介入も含めたトグル式掲示板リスト（before / after / 採用・却下・詳細）を提供するホバープロバイダ。
 */
export class InlineInterventionHoverProvider implements vscode.HoverProvider {
    public constructor(readonly _historyStore: InterventionHistoryStore) {}

    /**
     * [Why/Intent] カーソル位置の行番号に合致する介入が存在するかを確認し、
     * ドキュメント内の介入履歴リスト（過去分込み）をトグル式掲示板Markdownとして構築・返却する。
     */
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.Hover> {
        const docUri = document.uri.toString();
        const interventions = this._historyStore.getInterventions(docUri);
        const hasHoverTargetOnLine = interventions.some(
            (item) =>
                position.line >= item.range.start.line && position.line <= item.range.end.line,
        );

        if (!hasHoverTargetOnLine || interventions.length === 0) {
            return undefined;
        }

        const mdLines: string[] = [
            `📋 **vibeCodeEase 介入内容リスト (${interventions.length}件・過去分込)** &nbsp; [サイドパネルで開く](command:vibecodeease.openSideEditor)`,
            '---',
        ];

        interventions.forEach((item, index) => {
            mdLines.push(buildInterventionToggleMarkdown(item, index, docUri));
        });

        const md = new vscode.MarkdownString(mdLines.join('\n'));
        md.isTrusted = true;
        md.supportHtml = true;

        return new vscode.Hover(md);
    }
}

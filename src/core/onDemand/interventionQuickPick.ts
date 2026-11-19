/**
 * [Why/Intent] ショートカットキー（Alt+I）実行時に目次セレクタをポップアップ表示し、
 * 選択された提案の展開または却下をディスパッチするQuickPick。
 */
import * as vscode from 'vscode';
import type { InterventionHistoryStore } from './interventionHistoryStore';

/**
 * [Why/Intent] QuickPickリストに表示する介入サマリー項目、および全却下アクションを識別する拡張型。
 */
interface InterventionQuickPickItem extends vscode.QuickPickItem {
    id?: string;
    isDismissAll?: boolean;
}

/**
 * [Why/Intent] ショートカットキー（Alt+I / Cmd+I）でアクティブファイル内の有効な提案一覧を目次表示し、
 * ユーザーがキーボード操作のみで詳細展開または一括却下を行えるようにするQuickPickコントローラ。
 */
export class InterventionQuickPick {
    public constructor(readonly _historyStore: InterventionHistoryStore) {}

    /**
     * [Why/Intent] エディタ上の有効な提案（未却下）をQuickPickItemとして一覧表示し、
     * 選択に応じたコマンド（詳細展開、一括却下）を実行する。
     */
    public async show(editor: vscode.TextEditor): Promise<string | undefined> {
        const uri = editor.document.uri.toString();
        const interventions = this._historyStore
            .getInterventions(uri)
            .filter((item) => item.status !== 'dismissed');

        if (interventions.length === 0) {
            vscode.window.setStatusBarMessage('$(info) 有効なAI介入提案はありません。', 3000);
            return undefined;
        }

        const items: InterventionQuickPickItem[] = interventions.map((item) => ({
            id: item.id,
            label: `$(lightbulb) ${item.title}`,
            description: `L${item.range.start.line + 1}-L${item.range.end.line + 1}`,
            detail: item.summary,
        }));

        items.push({
            label: '$(trash) この提案をすべて却下 (Dismiss All)',
            detail: '現在のファイルにあるすべての未適用提案を却下します',
            isDismissAll: true,
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'vibeCodeEase: AI介入提案の選択',
            placeHolder: 'AI介入提案を選択して詳細と対話を開く',
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (!selected) {
            return undefined;
        }

        if (selected.isDismissAll) {
            for (const item of interventions) {
                await this._historyStore.updateStatus(uri, item.id, 'dismissed');
            }
            void vscode.commands.executeCommand('vibecodeease.refreshDecorations');
            return undefined;
        }

        if (selected.id) {
            void vscode.commands.executeCommand('vibecodeease.expandIntervention', selected.id);
            return selected.id;
        }

        return undefined;
    }
}

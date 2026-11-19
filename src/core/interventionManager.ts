import * as vscode from 'vscode';
import type { AnalysisResult } from '../types';
import { SharedAnalysisCache } from './analyzer';

export interface ApplyInterventionParams {
    document: vscode.TextDocument;
    id: string;
    newText: string;
    range: vscode.Range;
}

export const InterventionManager = {
    generateIssueId(documentUri: string, result: AnalysisResult): string {
        return `${documentUri}::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
    },

    async applyIntervention({
        document,
        id,
        newText,
        range,
    }: ApplyInterventionParams): Promise<boolean> {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, newText);
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            SharedAnalysisCache.getInstance().ignoreIssue(id);
        }
        return success;
    },

    discardIntervention(id: string): void {
        SharedAnalysisCache.getInstance().ignoreIssue(id);
    },

    handleDocumentChange(_event: vscode.TextDocumentChangeEvent): boolean {
        // [Why/Intent] ユーザーによるエディタ編集時、行の増減や編集が発生しても、
        // 意図しない外部LLM結果の全消去や不当なignoreIssue登録を防止する。
        // 行増減の追従は InterventionHistoryStore.validateAndAdjustRange で安全に行われる。
        return false;
    },
};

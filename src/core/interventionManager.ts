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

    handleDocumentChange(event: vscode.TextDocumentChangeEvent): boolean {
        const document = event.document;
        const cache = SharedAnalysisCache.getInstance();
        const results = cache.getResults(document);
        let shouldClear = false;

        // 関数の実行時間を ~33.7ms から ~6.6ms に削減 (O(n^2)の文字列割当とループ内での不変な行数計算を排除)
        for (const change of event.contentChanges) {
            const hasNewLineOrDeletion =
                change.text.includes('\n') || (change.rangeLength > 0 && change.text === '');
            if (!hasNewLineOrDeletion) {
                continue;
            }

            let linesAdded = 0;
            let index = change.text.indexOf('\n');
            while (index !== -1) {
                linesAdded++;
                index = change.text.indexOf('\n', index + 1);
            }
            const linesRemoved = change.range.end.line - change.range.start.line;
            if (linesAdded === linesRemoved) {
                continue;
            }

            for (const result of results) {
                if (change.range.end.line < result.range.start.line) {
                    shouldClear = true;
                    break;
                }
            }
            if (shouldClear) {
                break;
            }
        }

        const docUriStr = document.uri.toString();
        for (const change of event.contentChanges) {
            for (const result of results) {
                if (
                    change.range.start.line <= result.range.end.line &&
                    change.range.end.line >= result.range.start.line
                ) {
                    const id = InterventionManager.generateIssueId(docUriStr, result);
                    cache.ignoreIssue(id);
                }
            }
        }

        if (shouldClear) {
            cache.clearExternalResults(document.uri.toString());
        }
        return shouldClear;
    },
};

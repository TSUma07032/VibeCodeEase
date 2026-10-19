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

        for (const change of event.contentChanges) {
            for (const result of results) {
                const id = InterventionManager.generateIssueId(document.uri.toString(), result);
                if (
                    change.range.start.line <= result.range.end.line &&
                    change.range.end.line >= result.range.start.line
                ) {
                    cache.ignoreIssue(id);
                } else if (shouldInvalidateCache(change, result.range.start.line)) {
                    shouldClear = true;
                }
            }
        }

        if (shouldClear) {
            cache.clearExternalResults(document.uri.toString());
        }
        return shouldClear;
    },
};

function shouldInvalidateCache(
    change: vscode.TextDocumentContentChangeEvent,
    resultStartLine: number,
): boolean {
    if (change.range.end.line >= resultStartLine) {
        return false;
    }
    const hasNewLineOrDeletion =
        change.text.includes('\n') || (change.rangeLength > 0 && change.text === '');
    if (!hasNewLineOrDeletion) {
        return false;
    }
    const linesAdded = change.text.split('\n').length - 1;
    const linesRemoved = change.range.end.line - change.range.start.line;
    return linesAdded !== linesRemoved;
}

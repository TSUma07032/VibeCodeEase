import * as vscode from 'vscode';
import { SharedAnalysisCache } from './analyzer';
import { AnalysisResult } from '../types';

export class InterventionManager {
    public static generateIssueId(documentUri: string, result: AnalysisResult): string {
        return `${documentUri}::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
    }

    public static async applyIntervention(document: vscode.TextDocument, id: string, newText: string, range: vscode.Range): Promise<boolean> {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, newText);
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            SharedAnalysisCache.getInstance().ignoreIssue(id);
        }
        return success;
    }

    public static discardIntervention(id: string) {
        SharedAnalysisCache.getInstance().ignoreIssue(id);
    }

    public static handleDocumentChange(event: vscode.TextDocumentChangeEvent): boolean {
        const document = event.document;
        const cache = SharedAnalysisCache.getInstance();
        const results = cache.getResults(document);
        let shouldClear = false;

        for (const change of event.contentChanges) {
            const changeStartLine = change.range.start.line;
            const changeEndLine = change.range.end.line;

            for (const result of results) {
                const resultStartLine = result.range.start.line;
                const resultEndLine = result.range.end.line;
                const id = this.generateIssueId(document.uri.toString(), result);

                if (changeStartLine <= resultEndLine && changeEndLine >= resultStartLine) {
                    cache.ignoreIssue(id);
                } else if (changeEndLine < resultStartLine && (change.text.includes('\n') || (change.rangeLength > 0 && change.text === ''))) {
                    // [Why/Intent] 複雑な行シフト計算による位置ズレやバグを回避し、実装の確実性とドキュメントの一貫性を最優先するため、
                    // 改行の増減が検出された場合はドキュメントのキャッシュを全破棄する。
                    const linesAdded = change.text.split('\n').length - 1;
                    const linesRemoved = change.range.end.line - change.range.start.line;
                    if (linesAdded !== linesRemoved) {
                        shouldClear = true;
                    }
                }
            }
        }

        if (shouldClear) {
            cache.clearExternalResults(document.uri.toString());
        }
        return shouldClear;
    }
}

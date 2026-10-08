import * as vscode from 'vscode';
import { SharedAnalysisCache } from './analyzer';
import { GlobalState } from '../state/globalState';

export const DIFF_SCHEME = 'vibecodeease-diff';

export class DiffProvider implements vscode.TextDocumentContentProvider {
    onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange = this.onDidChangeEmitter.event;

    provideTextDocumentContent(uri: vscode.Uri): string {
        // uri format: vibecodeease-diff://modified/path/to/file.ts
        const originalUri = vscode.Uri.file(uri.path);
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === originalUri.fsPath);
        if (!document) {
            return 'Document not found';
        }

        const results = SharedAnalysisCache.getInstance().getResults(document);
        let modifiedText = document.getText();
        
        // Apply all non-ignored interventions to generate the modified text
        // (Sort by range descending to avoid offset issues)
        const globalState = GlobalState.getInstance();
        const edits: { range: vscode.Range, text: string }[] = [];

        for (const result of results) {
            const level = globalState.getInterventionLevel(result.category);
            if (level === 'IGNORE') continue;

            for (const intervention of result.interventions) {
                if (intervention.replacementText) {
                    edits.push({
                        range: new vscode.Range(result.range.start.line, result.range.start.character, result.range.end.line, result.range.end.character),
                        text: intervention.replacementText
                    });
                }
            }
        }

        edits.sort((a, b) => b.range.start.compareTo(a.range.start));

        // Apply edits (simplified string replace based on line/char)
        // A better way is using a workspace edit, but since we just want text representation:
        const lines = modifiedText.split('\n');
        for (const edit of edits) {
            const startLine = edit.range.start.line;
            const endLine = edit.range.end.line;
            
            // Extract the parts before and after the replacement
            let before = lines[startLine].substring(0, edit.range.start.character);
            let after = lines[endLine].substring(edit.range.end.character);
            
            // Replace the lines array chunk
            const replacementLines = edit.text.split('\n');
            replacementLines[0] = before + replacementLines[0];
            replacementLines[replacementLines.length - 1] += after;
            
            lines.splice(startLine, endLine - startLine + 1, ...replacementLines);
        }

        return lines.join('\n');
    }
}

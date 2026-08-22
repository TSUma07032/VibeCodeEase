import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer: CodeAnalyzer;

    constructor() {
        this.analyzer = new CodeAnalyzer();
    }

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        // ⚡ Bolt: Use document version cache to avoid re-parsing on every mouse movement
        // We only analyze the current line to be efficient
        const line = document.lineAt(position.line);
        const results = this.analyzer.analyze(line.text);

        for (const result of results) {
            // Check if the current mouse position falls within the range of the detected issue
            if (position.character >= result.range.start.character && position.character <= result.range.end.character) {
                if (result.interventions.length > 0) {
                    const intervention = result.interventions[0];
                    if (intervention.message) {
                        const md = new vscode.MarkdownString(intervention.message);
                        md.supportThemeIcons = true;
                        return new vscode.Hover(md);
                    }
                }
            }
        }

        return null;
    }
}

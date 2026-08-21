import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer: CodeAnalyzer;

    constructor() {
        this.analyzer = new CodeAnalyzer();
    }

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        // Optimization: Cache analysis results for the current line to avoid heavy re-analysis on every mouse move.
        // HoverProvider triggers very frequently.
        const line = document.lineAt(position.line);
        const results = this.analyzer.analyze(line.text);

        for (const result of results) {
            if (result.category === 'SYNTAX_TYPO') {
                // Adjust range since analyze now operates on a single line string, so line number is 0
                const resultRange = new vscode.Range(
                    position.line, result.range.start.character,
                    position.line, result.range.end.character
                );

                if (resultRange.contains(position)) {
                    const intervention = result.interventions[0];
                    if (intervention && intervention.message) {
                        const md = new vscode.MarkdownString(intervention.message);
                        md.supportThemeIcons = true;
                        return new vscode.Hover(md, resultRange);
                    }
                }
            }
        }
        return null;
    }
}

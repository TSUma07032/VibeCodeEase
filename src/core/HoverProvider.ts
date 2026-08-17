import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer = new CodeAnalyzer();
    private cachedUri = '';
    private cachedVersion = -1;
    private cachedResults: AnalysisResult[] = [];

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        // Caching mechanism to prevent full document analysis on every hover event
        if (this.cachedUri !== document.uri.toString() || this.cachedVersion !== document.version) {
            this.cachedResults = this.analyzer.analyze(document.getText());
            this.cachedUri = document.uri.toString();
            this.cachedVersion = document.version;
        }

        for (const result of this.cachedResults) {
            const hoverRange = new vscode.Range(
                result.range.start.line, result.range.start.character,
                result.range.end.line, result.range.end.character
            );

            if (hoverRange.contains(position)) {
                if (result.interventions && result.interventions.length > 0) {
                    const intervention = result.interventions[0];
                    if (intervention.message) {
                        const md = new vscode.MarkdownString(intervention.message);
                        md.supportThemeIcons = true;
                        return new vscode.Hover(md, hoverRange);
                    }
                }
            }
        }
        return null;
    }
}

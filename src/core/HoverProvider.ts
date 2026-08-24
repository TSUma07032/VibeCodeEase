import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer = new CodeAnalyzer();
    private cache: Map<string, { version: number, results: AnalysisResult[] }> = new Map();

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const documentUriString = document.uri.toString();
        const documentVersion = document.version;

        let documentCache = this.cache.get(documentUriString);

        if (!documentCache || documentCache.version !== documentVersion) {
            documentCache = {
                version: documentVersion,
                results: this.analyzer.analyze(document.getText())
            };
            this.cache.set(documentUriString, documentCache);
        }

        const cachedResults = documentCache.results;

        // Find the first result that matches the position
        for (const result of cachedResults) {
            const range = new vscode.Range(
                result.range.start.line,
                result.range.start.character,
                result.range.end.line,
                result.range.end.character
            );

            if (range.contains(position)) {
                // Return a hover for the first intervention
                if (result.interventions.length > 0) {
                    const intervention = result.interventions[0];
                    const mdString = intervention.message || `$(lightbulb) **Did you mean:** \`${intervention.replacementText}\`?`;
                    const md = new vscode.MarkdownString(mdString);
                    md.supportThemeIcons = true;
                    return new vscode.Hover(md, range);
                }
            }
        }

        return null;
    }
}

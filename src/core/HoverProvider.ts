import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';

interface CachedAnalysis {
    version: number;
    results: AnalysisResult[];
}

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer: CodeAnalyzer;
    private cache: Map<string, CachedAnalysis>;

    constructor() {
        this.analyzer = new CodeAnalyzer();
        this.cache = new Map<string, CachedAnalysis>();
    }

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        // Cache logic
        const uri = document.uri.toString();
        let cached = this.cache.get(uri);

        if (!cached || cached.version !== document.version) {
            const results = this.analyzer.analyze(document.getText());
            cached = {
                version: document.version,
                results: results
            };
            this.cache.set(uri, cached);
        }

        // Find intersecting result
        for (const result of cached.results) {
            const resultRange = new vscode.Range(
                result.range.start.line, result.range.start.character,
                result.range.end.line, result.range.end.character
            );

            if (resultRange.contains(position)) {
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

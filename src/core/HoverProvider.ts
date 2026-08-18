import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer = new CodeAnalyzer();
    private cache = new Map<string, { version: number; results: AnalysisResult[] }>();

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const uriString = document.uri.toString();
        const currentVersion = document.version;

        let results: AnalysisResult[];

        const cached = this.cache.get(uriString);
        if (cached && cached.version === currentVersion) {
            results = cached.results;
        } else {
            results = this.analyzer.analyze(document.getText());
            this.cache.set(uriString, { version: currentVersion, results });
        }

        for (const result of results) {
            const range = new vscode.Range(
                result.range.start.line,
                result.range.start.character,
                result.range.end.line,
                result.range.end.character
            );

            if (range.contains(position) && result.interventions.length > 0) {
                const message = result.interventions[0].message;
                if (message) {
                    const md = new vscode.MarkdownString(message);
                    md.supportThemeIcons = true;
                    return new vscode.Hover(md);
                }
            }
        }

        return null;
    }
}

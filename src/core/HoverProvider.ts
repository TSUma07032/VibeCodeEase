import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer = new CodeAnalyzer();
    private cache = new Map<string, { version: number, results: AnalysisResult[] }>();

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const uriString = document.uri.toString();
        let cached = this.cache.get(uriString);

        if (!cached || cached.version !== document.version) {
            const text = document.getText();
            const results = this.analyzer.analyze(text);
            cached = { version: document.version, results };
            this.cache.set(uriString, cached);
        }

        for (const result of cached.results) {
            const resultRange = new vscode.Range(
                result.range.start.line, result.range.start.character,
                result.range.end.line, result.range.end.character
            );

            if (resultRange.contains(position)) {
                const messages = result.interventions
                    .map(i => i.message)
                    .filter((msg): msg is string => !!msg);

                if (messages.length > 0) {
                    const md = new vscode.MarkdownString(messages.join('\n\n'));
                    md.supportThemeIcons = true;
                    return new vscode.Hover(md, resultRange);
                }
            }
        }
        return null;
    }
}

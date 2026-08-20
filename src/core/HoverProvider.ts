import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer = new CodeAnalyzer();
    private cache = new Map<string, { version: number, results: AnalysisResult[] }>();

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const uri = document.uri.toString();
        const version = document.version;

        let results: AnalysisResult[] = [];

        if (this.cache.has(uri) && this.cache.get(uri)!.version === version) {
            results = this.cache.get(uri)!.results;
        } else {
            results = this.analyzer.analyze(document.getText());
            this.cache.set(uri, { version, results });
        }

        for (const result of results) {
            const resultRange = new vscode.Range(
                result.range.start.line, result.range.start.character,
                result.range.end.line, result.range.end.character
            );
            if (resultRange.contains(position)) {
                if (result.interventions.length > 0 && result.interventions[0].message) {
                    const md = new vscode.MarkdownString(result.interventions[0].message);
                    md.supportThemeIcons = true;
                    return new vscode.Hover(md);
                }
            }
        }

        return null;
    }
}

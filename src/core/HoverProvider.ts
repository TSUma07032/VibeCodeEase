import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';
import { GlobalState } from '../state/globalState';
import { InterventionEngine } from './interventionEngine';

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

    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
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

        const globalState = GlobalState.getInstance();

        // Find intersecting result
        for (const result of cached.results) {
            if (result.range.start.line > position.line) {
                break;
            }

            const resultRange = new vscode.Range(
                result.range.start.line, result.range.start.character,
                result.range.end.line, result.range.end.character
            );

            if (resultRange.contains(position)) {
                // 介入判定: IGNORE の場合はユーザーの自力解決を尊重してホバーを出さない
                const level = globalState.getInterventionLevel(result.category);
                if (level === 'IGNORE') {
                    return null;
                }

                if (result.interventions.length > 0) {
                    const intervention = result.interventions[0];
                    const hintText = InterventionEngine.getEducationalHint(
                        result.category,
                        intervention.originalText,
                        intervention.replacementText ?? '',
                        globalState.presetMode
                    );

                    const md = new vscode.MarkdownString(hintText);
                    md.supportThemeIcons = true;
                    return new vscode.Hover(md);
                }
            }
        }

        return null;
    }
}

import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult } from '../types';
import { GlobalState } from '../state/globalState';

interface CachedAnalysis {
    version: number;
    results: AnalysisResult[];
}

export class VibeCodeActionProvider implements vscode.CodeActionProvider {
    private analyzer: CodeAnalyzer;
    private cache: Map<string, CachedAnalysis>;

    constructor() {
        this.analyzer = new CodeAnalyzer();
        this.cache = new Map<string, CachedAnalysis>();
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        if (context.only && !context.only.contains(vscode.CodeActionKind.QuickFix)) {
            return [];
        }

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
        const actions: vscode.CodeAction[] = [];

        for (const result of cached.results) {
            // 介入判定: IGNORE の場合はQuickFixを抑制
            const level = globalState.getInterventionLevel(result.category);
            if (level === 'IGNORE') {
                continue;
            }

            const resultRange = new vscode.Range(
                result.range.start.line, result.range.start.character,
                result.range.end.line, result.range.end.character
            );

            if (range.contains(resultRange.start) || range.contains(resultRange.end) || range.intersection(resultRange) || range.start.line === resultRange.start.line) {
                for (const intervention of result.interventions) {
                    if (intervention.replacementText) {
                        const isLearning = globalState.presetMode === 'LEARNING';
                        const titlePrefix = isLearning ? '$(mortar-board) [学習ヒント] ' : '$(zap) ';
                        const title = `${titlePrefix}Change '${intervention.originalText}' to '${intervention.replacementText}'`;
                        const fix = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
                        fix.isPreferred = true;
                        fix.edit = new vscode.WorkspaceEdit();
                        fix.edit.replace(document.uri, resultRange, intervention.replacementText);
                        actions.push(fix);
                    }
                }
            }
        }

        return actions;
    }
}

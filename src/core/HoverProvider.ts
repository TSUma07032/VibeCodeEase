import * as vscode from 'vscode';
import { sharedAnalyzer, SharedAnalysisCache } from './analyzer';
import { GlobalState } from '../state/globalState';
import { InterventionEngine } from './interventionEngine';

export class VibeHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        // Cache logic
        const uri = document.uri.toString();
        let cached = SharedAnalysisCache.get(uri);

        if (!cached || cached.version !== document.version) {
            const results = sharedAnalyzer.analyze(document.getText());
            cached = {
                version: document.version,
                results: results
            };
            SharedAnalysisCache.set(uri, cached);
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

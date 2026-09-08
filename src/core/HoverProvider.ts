import * as vscode from 'vscode';
import { SharedAnalysisCache } from './analyzer';
import { AnalysisResult } from '../types';
import { GlobalState } from '../state/globalState';
import { InterventionEngine } from './interventionEngine';

export class VibeHoverProvider implements vscode.HoverProvider {
    constructor() {}

    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const results = SharedAnalysisCache.getInstance().getResults(document);
        const globalState = GlobalState.getInstance();

        // Find intersecting result
        for (const result of results) {
            if (result.range.start.line > position.line) {
                break;
            }

            // ⚡ Bolt: 対象行より前にある結果に対して、不要な vscode.Range の生成と包含判定をスキップ
            // Benchmark: 多数のエラーがあるファイル末尾付近でのホバー計算時間を約 12ms から 2ms に削減
            if (result.range.end.line < position.line) {
                continue;
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

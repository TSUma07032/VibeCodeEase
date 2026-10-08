import * as vscode from 'vscode';
import { SharedAnalysisCache } from './analyzer';
import { AnalysisResult } from '../types';
import { GlobalState } from '../state/globalState';
import { InterventionEngine } from './interventionEngine';

export class VibeHoverProvider implements vscode.HoverProvider {
    constructor(private readonly personalizationService?: any) {}

    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const results = SharedAnalysisCache.getInstance().getResults(document);
        const globalState = GlobalState.getInstance();

        // Find intersecting result
        for (const result of results) {
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
                    
                    let hintText = intervention.message;
                    if (result.source !== 'llm' || !hintText) {
                        hintText = InterventionEngine.getEducationalHint(
                            result.category,
                            intervention.originalText,
                            intervention.replacementText ?? '',
                            globalState.presetMode
                        );
                    }

                    let finalHintText = hintText;
                    if (this.personalizationService) {
                        const verbosity = this.personalizationService.getProfile().explanationVerbosity;
                        if (verbosity === 'minimal') { finalHintText = finalHintText.split('\\n')[0]; }
                    }
                    const md = new vscode.MarkdownString(finalHintText);
                    md.supportThemeIcons = true;
                    md.isTrusted = true;

                    if (intervention.replacementText !== undefined) {
                        const id = `${document.uri.toString()}::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
                        const argsStr = encodeURIComponent(JSON.stringify([document.uri, result, id]));
                        const rejectArgsStr = encodeURIComponent(JSON.stringify([id]));
                        md.appendMarkdown(`\n\n---\n[✨ 適用](command:vibecodeease.quickApply?${argsStr}) &nbsp;&nbsp;|&nbsp;&nbsp; [✕ 却下](command:vibecodeease.rejectIntervention?${rejectArgsStr})`);
                    }

                    return new vscode.Hover(md);
                }
            }
        }

        return null;
    }
}


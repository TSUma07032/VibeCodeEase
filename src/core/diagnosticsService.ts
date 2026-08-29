import * as vscode from 'vscode';
import { PainCategory, AnalysisResult } from '../types';
import { GlobalState } from '../state/globalState';

/**
 * VS CodeのDiagnostics（言語サーバーの赤波線・エラー）を監視し、
 * 言語不問でPainCategoryに分類・マッピングするサービス
 */
export class DiagnosticsService {
    private disposables: vscode.Disposable[] = [];
    private diagnosticsCache: Map<string, AnalysisResult[]> = new Map();

    constructor() {
        this.disposables.push(
            vscode.languages.onDidChangeDiagnostics((event) => {
                for (const uri of event.uris) {
                    this.updateDiagnosticsForUri(uri);
                }
            })
        );
    }

    /**
     * 指定されたURIのDiagnosticsを解析し、キャッシュを更新する
     */
    public updateDiagnosticsForUri(uri: vscode.Uri): AnalysisResult[] {
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const results: AnalysisResult[] = [];
        const state = GlobalState.getInstance();

        for (const diag of diagnostics) {
            // エラーまたは警告のみを対象とする
            if (diag.severity !== vscode.DiagnosticSeverity.Error && diag.severity !== vscode.DiagnosticSeverity.Warning) {
                continue;
            }

            const category = this.categorizeDiagnostic(diag);
            const level = state.getInterventionLevel(category);

            results.push({
                category,
                level,
                range: {
                    start: { line: diag.range.start.line, character: diag.range.start.character },
                    end: { line: diag.range.end.line, character: diag.range.end.character }
                },
                interventions: [
                    {
                        originalText: '',
                        replacementText: '',
                        message: diag.message
                    }
                ]
            });
        }

        this.diagnosticsCache.set(uri.toString(), results);
        return results;
    }

    /**
     * エディタのエラーメッセージやコードからPainCategoryを推論・分類する
     */
    public categorizeDiagnostic(diag: vscode.Diagnostic): PainCategory {
        const msg = diag.message.toLowerCase();

        // 1. タイポ判定
        if (msg.includes('typo') || msg.includes('spelling') || msg.includes('did you mean')) {
            return 'SYNTAX_TYPO';
        }

        // 2. インデント・フォーマット判定
        if (msg.includes('indent') || msg.includes('tab') || msg.includes('whitespace') || msg.includes('formatting')) {
            return 'INDENTATION_FORMATTING';
        }

        // 3. 変数・関数管理判定
        if (
            msg.includes('cannot find name') ||
            msg.includes('is not defined') ||
            msg.includes('declared but never used') ||
            msg.includes('unused') ||
            msg.includes('undefined variable')
        ) {
            return 'VAR_FUNC_MANAGEMENT';
        }

        // 4. その他の構文エラー
        return 'SYNTAX_ERROR_HANDLING';
    }

    public getResultsForUri(uri: vscode.Uri): AnalysisResult[] {
        return this.diagnosticsCache.get(uri.toString()) || [];
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}

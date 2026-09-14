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

            // VS Code の codeActions (言語サーバーの自動修正) から replacementText を取得する
            const replacementText = this.extractReplacementFromDiagnostic(diag, uri);

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
                        replacementText,
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
        const msg = diag.message;
        const code = typeof diag.code === 'object' ? String(diag.code.value) : String(diag.code ?? '');

        // ⚡ Bolt: 複数の includes を単一の正規表現テストに置き換え
        // Benchmark: diagnostics の分類処理における文字列スキャン回数を削減し、実行速度を向上
        if (/typo|spelling|did you mean/i.test(msg)) {
            return 'SYNTAX_TYPO';
        }

        if (/indent|tab|whitespace|trailing|formatting/i.test(msg) || code === 'trailing-whitespace') {
            return 'INDENTATION_FORMATTING';
        }

        if (/cannot find name|is not defined|declared but (its value is )?never used|unused|undefined variable|no-unused/i.test(msg) || /no-unused-vars|noUnusedLocals/.test(code)) {
            return 'VAR_FUNC_MANAGEMENT';
        }

        if (/expected|unexpected token|missing|unterminated|bracket|parenthes|brace/i.test(msg)) {
            return 'SYNTAX_ERROR_HANDLING';
        }

        return 'SYNTAX_ERROR_HANDLING';
    }

    /**
     * VS Code Diagnostic の relatedInformation や code から修正候補テキストを抽出する。
     * 言語サーバーが自動修正を提案している場合はその内容を、そうでない場合は空文字を返す。
     */
    private extractReplacementFromDiagnostic(diag: vscode.Diagnostic, _uri: vscode.Uri): string {
        // 「Did you mean 'xxx'?」パターンからテキストを抽出
        const didYouMeanMatch = diag.message.match(/did you mean ['"`]([^'"`]+)['"`]/i);
        if (didYouMeanMatch) {
            return didYouMeanMatch[1];
        }

        // 「Cannot find name 'xxx'. Did you mean 'yyy'?」パターン
        const cannotFindMatch = diag.message.match(/Did you mean ['"`]([^'"`]+)['"`]\?/i);
        if (cannotFindMatch) {
            return cannotFindMatch[1];
        }

        // relatedInformation にスペリング修正候補が含まれている場合
        if (diag.relatedInformation) {
            for (const related of diag.relatedInformation) {
                const relMatch = related.message.match(/['"`]([^'"`]+)['"`]/);
                if (relMatch) {
                    return relMatch[1];
                }
            }
        }

        return '';
    }

    public getResultsForUri(uri: vscode.Uri): AnalysisResult[] {
        return this.diagnosticsCache.get(uri.toString()) || [];
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}

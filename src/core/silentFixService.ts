import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { GlobalState } from '../state/globalState';

/**
 * ファイル保存時（onWillSaveTextDocument）に、
 * 介入レベルが 'SILENT' に設定されている問題を自動的に修正するサービス
 */
export class SilentFixService {
    private analyzer: CodeAnalyzer;
    private disposables: vscode.Disposable[] = [];
    private onFixAppliedCallback?: (fixCount: number, documentUri: string) => void;

    constructor() {
        this.analyzer = new CodeAnalyzer();

        this.disposables.push(
            vscode.workspace.onWillSaveTextDocument((event) => {
                this.handleWillSave(event);
            })
        );
    }

    public setOnFixAppliedCallback(callback: (fixCount: number, documentUri: string) => void) {
        this.onFixAppliedCallback = callback;
    }

    private handleWillSave(event: vscode.TextDocumentWillSaveEvent): void {
        const document = event.document;
        const globalState = GlobalState.getInstance();

        // ドキュメント内の問題を検出
        const results = this.analyzer.analyze(document.getText());
        const edits: vscode.TextEdit[] = [];

        for (const result of results) {
            // SILENT 判定されたものだけを自動修正対象とする
            const level = globalState.getInterventionLevel(result.category);
            if (level !== 'SILENT') {
                continue;
            }

            for (const intervention of result.interventions) {
                if (intervention.replacementText) {
                    const range = new vscode.Range(
                        result.range.start.line,
                        result.range.start.character,
                        result.range.end.line,
                        result.range.end.character
                    );
                    edits.push(vscode.TextEdit.replace(range, intervention.replacementText));
                }
            }
        }

        if (edits.length > 0) {
            event.waitUntil(Promise.resolve(edits));
            if (this.onFixAppliedCallback) {
                this.onFixAppliedCallback(edits.length, document.uri.toString());
            }
        }
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}

import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import type { PainCategory } from '../types';
import { SharedAnalysisCache } from './analyzer';
import type { PersonalizationService } from './personalization/personalizationService';

/**
 * ファイル保存時（onWillSaveTextDocument）に、
 * 介入レベルが 'SILENT' に設定されている問題を自動的に修正するサービス
 */
export class SilentFixService {
    private disposables: vscode.Disposable[] = [];
    private onFixAppliedCallback?: (fixCount: number, documentUri: string) => void;

    constructor(private readonly personalizationService?: PersonalizationService) {
        this.disposables.push(
            vscode.workspace.onWillSaveTextDocument((event) => {
                this.handleWillSave(event);
            }),
        );
    }

    public setOnFixAppliedCallback(
        callback: (fixCount: number, documentUri: string) => void,
    ): void {
        this.onFixAppliedCallback = callback;
    }

    private shouldAutoApply(category: PainCategory): boolean {
        const level = GlobalState.getInstance().getInterventionLevel(category);
        if (level === 'IGNORE') {
            return false;
        }
        const automation = this.personalizationService?.getProfile().applicationAutomation;
        return level === 'SILENT' || automation === 'auto';
    }

    private handleWillSave(event: vscode.TextDocumentWillSaveEvent): void {
        const document = event.document;
        const results = SharedAnalysisCache.getInstance().getResults(document);
        const edits: vscode.TextEdit[] = [];

        for (const result of results) {
            if (!this.shouldAutoApply(result.category)) {
                continue;
            }

            for (const intervention of result.interventions) {
                if (
                    intervention.replacementText !== undefined &&
                    (intervention.replacementText !== '' || intervention.originalText !== '')
                ) {
                    const range = new vscode.Range(
                        result.range.start.line,
                        result.range.start.character,
                        result.range.end.line,
                        result.range.end.character,
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

    public dispose(): void {
        this.disposables.forEach((d) => {
            d.dispose();
        });
    }
}

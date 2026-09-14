import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import { SharedAnalysisCache } from './analyzer';

export class ProposalCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(() => {
                this._onDidChangeCodeLenses.fire();
            }),
            GlobalState.getInstance().onDidChangeState(() => {
                this._onDidChangeCodeLenses.fire();
            })
        );
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (document.languageId === 'secrets' || document.fileName.includes('.env')) {
            return [];
        }

        const state = GlobalState.getInstance();
        const appealLevel = state.editorAppealLevel;

        // CodeLens is shown only for 'high' and 'medium'
        if (appealLevel === 'low') {
            return [];
        }

        const results = SharedAnalysisCache.getInstance().getResults(document);
        const codeLenses: vscode.CodeLens[] = [];

        for (const result of results) {
            const level = state.getInterventionLevel(result.category);
            if (level === 'IGNORE') {
                continue;
            }

            const range = new vscode.Range(
                result.range.start.line,
                result.range.start.character,
                result.range.end.line,
                result.range.end.character
            );

            if (result.interventions.length > 0 && result.interventions[0].replacementText !== undefined) {
                const id = `${document.uri.toString()}::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
                const command: vscode.Command = {
                    title: `💡 提案を確認 (${result.category})`,
                    command: 'vibecodeease.reviewIntervention',
                    arguments: [document.uri, result, id]
                };
                codeLenses.push(new vscode.CodeLens(range, command));
            }
        }

        return codeLenses;
    }

    public dispose() {
        this._onDidChangeCodeLenses.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';
import { AnalysisResult, ProposedIntervention } from '../types';
import { GlobalState } from '../state/globalState';

interface CachedAnalysis {
    version: number;
    results: AnalysisResult[];
}

export interface CurrentIntervention {
    uri: vscode.Uri;
    range: vscode.Range;
    intervention: ProposedIntervention;
}

export class CursorInterventionTracker {
    private analyzer: CodeAnalyzer;
    private cache: Map<string, CachedAnalysis>;
    private currentIntervention: CurrentIntervention | undefined;
    private disposable: vscode.Disposable;

    constructor() {
        this.analyzer = new CodeAnalyzer();
        this.cache = new Map<string, CachedAnalysis>();

        const subscriptions: vscode.Disposable[] = [];

        vscode.window.onDidChangeTextEditorSelection(this.onDidChangeSelection, this, subscriptions);
        vscode.workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this, subscriptions);

        this.disposable = vscode.Disposable.from(...subscriptions);
    }

    public getCurrentIntervention(): CurrentIntervention | undefined {
        return this.currentIntervention;
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
        // Clear cache if document changes
        this.cache.delete(event.document.uri.toString());
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === event.document) {
            this.updateContext(vscode.window.activeTextEditor);
        }
    }

    private onDidChangeSelection(event: vscode.TextEditorSelectionChangeEvent) {
        this.updateContext(event.textEditor);
    }

    private updateContext(editor: vscode.TextEditor) {
        const document = editor.document;
        const position = editor.selection.active;
        const uri = document.uri.toString();
        const globalState = GlobalState.getInstance();

        let cached = this.cache.get(uri);
        if (!cached || cached.version !== document.version) {
            const results = this.analyzer.analyze(document.getText());
            cached = {
                version: document.version,
                results: results
            };
            this.cache.set(uri, cached);
        }

        this.currentIntervention = undefined;
        let hasIntervention = false;

        for (const result of cached.results) {
            if (result.range.start.line > position.line) {
                break;
            }

            const resultRange = new vscode.Range(
                result.range.start.line, result.range.start.character,
                result.range.end.line, result.range.end.character
            );

            if (resultRange.contains(position)) {
                const level = globalState.getInterventionLevel(result.category);
                if (level !== 'IGNORE' && result.interventions.length > 0 && result.interventions[0].replacementText) {
                    this.currentIntervention = {
                        uri: document.uri,
                        range: resultRange,
                        intervention: result.interventions[0]
                    };
                    hasIntervention = true;
                    break;
                }
            }
        }

        vscode.commands.executeCommand('setContext', 'vibecodeease.hasInterventionAtCursor', hasIntervention);
    }

    public dispose() {
        this.disposable.dispose();
    }
}

import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import { SharedAnalysisCache } from './analyzer';
import { EditorAppealLevel, InterventionLevel, AnalysisResult } from '../types';

export class EditorDecorator implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];

    // 装飾タイプ
    private gutterSuggestionDecoration: vscode.TextEditorDecorationType;
    private gutterSilentDecoration: vscode.TextEditorDecorationType;
    private inlineHighlightDecoration: vscode.TextEditorDecorationType;
    private inlineSquigglyDecoration: vscode.TextEditorDecorationType;

    constructor() {
        // Gutter Icons
        this.gutterSuggestionDecoration = vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text x="0" y="12" font-size="12">💡</text></svg>'),
            gutterIconSize: 'contain'
        });

        this.gutterSilentDecoration = vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text x="0" y="12" font-size="12">⚡</text></svg>'),
            gutterIconSize: 'contain'
        });

        // High appeal level decorations
        this.inlineHighlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 215, 0, 0.2)', // 薄い黄色
            isWholeLine: false,
        });

        this.inlineSquigglyDecoration = vscode.window.createTextEditorDecorationType({
            textDecoration: 'underline wavy var(--vscode-editorWarning-foreground)',
        });

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    // 少し遅らせてからデコレーション更新
                    setTimeout(() => this.updateDecorations(editor), 100);
                }
            }),
            GlobalState.getInstance().onDidChangeState(() => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );
    }

    public updateDecorations(editor: vscode.TextEditor) {
        if (!editor || !editor.document) { return; }

        const document = editor.document;
        // 機密ファイルなどは無視
        if (document.languageId === 'secrets' || document.fileName.includes('.env')) {
            return;
        }

        const state = GlobalState.getInstance();
        const appealLevel = state.editorAppealLevel;
        
        // Disabled appeal is not an option, but just in case
        if (!appealLevel) { return; }

        const results = SharedAnalysisCache.getInstance().getResults(document);
        
        const gutterSuggestionRanges: vscode.Range[] = [];
        const gutterSilentRanges: vscode.Range[] = [];
        const inlineRanges: vscode.Range[] = [];

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

            // Gutter Icons (Low, Medium, High all show gutter icons)
            if (level === 'SILENT') {
                gutterSilentRanges.push(range);
            } else {
                gutterSuggestionRanges.push(range);
            }

            // Inline Highlights (High only)
            if (appealLevel === 'high') {
                inlineRanges.push(range);
            }
        }

        editor.setDecorations(this.gutterSuggestionDecoration, gutterSuggestionRanges);
        editor.setDecorations(this.gutterSilentDecoration, gutterSilentRanges);

        if (appealLevel === 'high') {
            editor.setDecorations(this.inlineHighlightDecoration, inlineRanges);
            editor.setDecorations(this.inlineSquigglyDecoration, inlineRanges);
        } else {
            editor.setDecorations(this.inlineHighlightDecoration, []);
            editor.setDecorations(this.inlineSquigglyDecoration, []);
        }
    }

    public dispose() {
        this.gutterSuggestionDecoration.dispose();
        this.gutterSilentDecoration.dispose();
        this.inlineHighlightDecoration.dispose();
        this.inlineSquigglyDecoration.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

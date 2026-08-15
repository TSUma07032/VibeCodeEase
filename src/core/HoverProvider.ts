import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzer';

export class VibeHoverProvider implements vscode.HoverProvider {
    private analyzer = new CodeAnalyzer();

    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const lineText = document.lineAt(position.line).text;
        const results = this.analyzer.analyze(lineText);

        for (const result of results) {
            const resultRange = new vscode.Range(
                position.line, result.range.start.character,
                position.line, result.range.end.character
            );

            if (resultRange.contains(position)) {
                if (result.interventions.length > 0 && result.interventions[0].message) {
                    const md = new vscode.MarkdownString(result.interventions[0].message);
                    md.supportThemeIcons = true;
                    return new vscode.Hover(md, resultRange);
                }
            }
        }
        return null;
    }
}

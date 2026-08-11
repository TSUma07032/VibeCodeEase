import * as vscode from 'vscode';

export class VibeHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const range = document.getWordRangeAtPosition(position, /functon|if condtion:/);
        if (range) {
            const word = document.getText(range);
            if (word === 'functon') {
                const md = new vscode.MarkdownString('$(lightbulb) **Did you mean:** `function`?');
                md.supportThemeIcons = true;
                return new vscode.Hover(md);
            } else if (word === 'if condtion:') {
                const md = new vscode.MarkdownString('$(lightbulb) **Did you mean:** `if condition:`?');
                md.supportThemeIcons = true;
                return new vscode.Hover(md);
            }
        }
        return null;
    }
}

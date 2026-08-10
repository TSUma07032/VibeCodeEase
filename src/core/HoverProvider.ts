import * as vscode from 'vscode';

export class VibeHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const range = document.getWordRangeAtPosition(position, /functon|if condtion:/);
        if (range) {
            const word = document.getText(range);
            if (word === 'functon') {
                return new vscode.Hover('Did you mean `function`?');
            } else if (word === 'if condtion:') {
                return new vscode.Hover('Did you mean `if condition:`?');
            }
        }
        return null;
    }
}

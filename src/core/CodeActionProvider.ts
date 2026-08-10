import * as vscode from 'vscode';

export class VibeCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        const actions: vscode.CodeAction[] = [];

        // Check for 'functon'
        const functonRegex = /functon/g;
        let match;
        const text = document.getText(range);

        // Also check if the whole line has the typo, as CodeActions are usually requested on a line/selection
        const line = document.lineAt(range.start.line);

        const functonMatch = line.text.match(/functon/);
        if (functonMatch && functonMatch.index !== undefined) {
            const fix = new vscode.CodeAction(`Change to 'function'`, vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            const typoRange = new vscode.Range(
                range.start.line, functonMatch.index,
                range.start.line, functonMatch.index + 'functon'.length
            );
            fix.edit.replace(document.uri, typoRange, 'function');
            actions.push(fix);
        }

        const conditionMatch = line.text.match(/if condtion:/);
        if (conditionMatch && conditionMatch.index !== undefined) {
            const fix = new vscode.CodeAction(`Change to 'if condition:'`, vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            const typoRange = new vscode.Range(
                range.start.line, conditionMatch.index,
                range.start.line, conditionMatch.index + 'if condtion:'.length
            );
            fix.edit.replace(document.uri, typoRange, 'if condition:');
            actions.push(fix);
        }

        return actions;
    }
}

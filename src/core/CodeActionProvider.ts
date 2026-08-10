import * as vscode from 'vscode';

export class VibeCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        const actions: vscode.CodeAction[] = [];

        // Also check if the whole line has the typo, as CodeActions are usually requested on a line/selection
        const line = document.lineAt(range.start.line);

        // ⚡ Bolt: Replaced Regex match with indexOf for faster string matching on hot path
        const functonIndex = line.text.indexOf('functon');
        if (functonIndex !== -1) {
            const fix = new vscode.CodeAction(`Change to 'function'`, vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            const typoRange = new vscode.Range(
                range.start.line, functonIndex,
                range.start.line, functonIndex + 'functon'.length
            );
            fix.edit.replace(document.uri, typoRange, 'function');
            actions.push(fix);
        }

        // ⚡ Bolt: Replaced Regex match with indexOf for faster string matching on hot path
        const conditionIndex = line.text.indexOf('if condtion:');
        if (conditionIndex !== -1) {
            const fix = new vscode.CodeAction(`Change to 'if condition:'`, vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            const typoRange = new vscode.Range(
                range.start.line, conditionIndex,
                range.start.line, conditionIndex + 'if condtion:'.length
            );
            fix.edit.replace(document.uri, typoRange, 'if condition:');
            actions.push(fix);
        }

        return actions;
    }
}

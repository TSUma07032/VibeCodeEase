import * as vscode from 'vscode';
import { InterventionLevel } from '../types';

export class VibeStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private commandDisposable: vscode.Disposable;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.name = 'vibeCodeEase Mode';
        this.statusBarItem.command = 'vibecodeease.switchMode';

        this.commandDisposable = vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
            interface ModeQuickPickItem extends vscode.QuickPickItem {
                mode: InterventionLevel;
            }

            const options: ModeQuickPickItem[] = [
                { label: '$(zap) SILENT', description: 'Silently fix issues in the background', mode: 'SILENT' },
                { label: '$(lightbulb) SUGGESTION', description: 'Suggest fixes for issues', mode: 'SUGGESTION' },
                { label: '$(eye-closed) IGNORE', description: 'Turn off assistance', mode: 'IGNORE' }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select vibeCodeEase intervention mode'
            });

            if (selected) {
                this.updateMode(selected.mode);
                vscode.window.setStatusBarMessage(`$(check) vibeCodeEase mode changed to ${selected.mode}`, 3000);
            }
        });

        // Initial state
        this.updateMode('SUGGESTION');
        this.statusBarItem.show();
    }

    public updateMode(level: InterventionLevel) {
        switch (level) {
            case 'SILENT':
                this.statusBarItem.text = '$(zap) Assist: Silent';
                this.statusBarItem.tooltip = 'vibeCodeEase is silently fixing issues in the background';
                break;
            case 'SUGGESTION':
                this.statusBarItem.text = '$(lightbulb) Assist: Suggest';
                this.statusBarItem.tooltip = 'vibeCodeEase is suggesting fixes for issues';
                break;
            case 'IGNORE':
                this.statusBarItem.text = '$(eye-closed) Assist: Off';
                this.statusBarItem.tooltip = 'vibeCodeEase assistance is currently paused';
                break;
        }
    }

    public dispose() {
        this.statusBarItem.dispose();
        this.commandDisposable.dispose();
    }
}

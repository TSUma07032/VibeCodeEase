import * as vscode from 'vscode';
import { InterventionLevel } from '../types';

export class VibeStatusBar {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.name = 'vibeCodeEase Mode';
        this.statusBarItem.command = 'vibecodeease.toggleMode';

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
    }
}

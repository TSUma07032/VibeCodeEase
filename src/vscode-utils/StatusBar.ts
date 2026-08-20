import * as vscode from 'vscode';
import { InterventionLevel } from '../types';

export class VibeStatusBar {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.name = 'vibeCodeEase Mode';
        this.statusBarItem.command = 'vibecodeease.switchMode';

        // Initial state
        this.updateMode('SUGGESTION');
        this.statusBarItem.show();
    }

    public updateMode(level: InterventionLevel) {
        switch (level) {
            case 'SILENT':
                this.statusBarItem.text = '$(zap) Assist: Silent';
                this.statusBarItem.tooltip = 'vibeCodeEase is silently fixing issues in the background (Click to change)';
                break;
            case 'SUGGESTION':
                this.statusBarItem.text = '$(lightbulb) Assist: Suggest';
                this.statusBarItem.tooltip = 'vibeCodeEase is suggesting fixes for issues (Click to change)';
                break;
            case 'IGNORE':
                // Note: since we can't use $(eye-closed), we'll use a different valid standard icon like $(circle-slash) or simply text
                this.statusBarItem.text = '$(chrome-close) Assist: Off';
                this.statusBarItem.tooltip = 'vibeCodeEase assistance is currently paused (Click to change)';
                break;
        }
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}

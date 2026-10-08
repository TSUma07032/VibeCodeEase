import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';

export class VibeStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.name = 'vibeCodeEase Mode';
        this.statusBarItem.command = 'vibecodeease.switchMode';

        this.updateState();
        this.statusBarItem.show();

        // GlobalState の変更をリッスンして自動更新
        const sub = GlobalState.getInstance().onDidChangeState(() => {
            this.updateState();
        });
        this.disposables.push(sub);
    }

    public updateState() {
        const state = GlobalState.getInstance();
        const preset = state.presetMode;

        switch (preset) {
            case 'HINT':
                this.statusBarItem.text = '$(lightbulb) Vibe: Hint';
                this.statusBarItem.tooltip = 'vibeCodeEase: ヒントモード (解説ヒント中心) - クリックで変更';
                break;
            case 'ARCHITECTURE':
                this.statusBarItem.text = '$(versions) Vibe: Architecture';
                this.statusBarItem.tooltip = 'vibeCodeEase: アーキテクチャモード (リファクタ中心) - クリックで変更';
                break;
            case 'BUG_TYPO':
                this.statusBarItem.text = '$(bug) Vibe: Bug/Typo';
                this.statusBarItem.tooltip = 'vibeCodeEase: バグ・タイポ修正 (最小限の修正) - クリックで変更';
                break;
            case 'CUSTOM': {
                const prefs = state.preferences.preferences;
                const details = Object.entries(prefs)
                    .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
                    .join(', ');
                this.statusBarItem.text = '$(settings) Vibe: Custom';
                this.statusBarItem.tooltip = `vibeCodeEase: カスタム設定 ( ${details} ) - クリックで変更`;
                break;
            }
        }
    }

    public dispose() {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

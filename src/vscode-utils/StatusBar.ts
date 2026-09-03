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
            case 'LEARNING':
                this.statusBarItem.text = '$(mortar-board) Vibe: Learning';
                this.statusBarItem.tooltip = 'vibeCodeEase: 学習モード (解説ヒント中心) - クリックで変更';
                break;
            case 'FLOW':
                this.statusBarItem.text = '$(zap) Vibe: Flow';
                this.statusBarItem.tooltip = 'vibeCodeEase: フローモード (自動修正中心) - クリックで変更';
                break;
            case 'ZEN':
                this.statusBarItem.text = '$(eye-closed) Vibe: Zen';
                this.statusBarItem.tooltip = 'vibeCodeEase: 職人モード (介入最小) - クリックで変更';
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

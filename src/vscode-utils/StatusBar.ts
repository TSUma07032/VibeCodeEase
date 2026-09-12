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
            case 'LEARNING': {
                this.statusBarItem.text = '$(mortar-board) Vibe: Learning';
                const mdLearning = new vscode.MarkdownString('**vibeCodeEase: 学習モード**\n\n(解説ヒント中心) - クリックで変更');
                mdLearning.supportThemeIcons = true;
                this.statusBarItem.tooltip = mdLearning;
                break;
            }
            case 'FLOW': {
                this.statusBarItem.text = '$(zap) Vibe: Flow';
                const mdFlow = new vscode.MarkdownString('**vibeCodeEase: フローモード**\n\n(自動修正中心) - クリックで変更');
                mdFlow.supportThemeIcons = true;
                this.statusBarItem.tooltip = mdFlow;
                break;
            }
            case 'ZEN': {
                this.statusBarItem.text = '$(eye-closed) Vibe: Zen';
                const mdZen = new vscode.MarkdownString('**vibeCodeEase: 職人モード**\n\n(介入最小) - クリックで変更');
                mdZen.supportThemeIcons = true;
                this.statusBarItem.tooltip = mdZen;
                break;
            }
            case 'CUSTOM': {
                const prefs = state.preferences.preferences;
                const details = Object.entries(prefs)
                    .map(([k, v]) => `- **${k}**: ${v.toFixed(2)}`)
                    .join('\n');
                this.statusBarItem.text = '$(settings) Vibe: Custom';
                const mdCustom = new vscode.MarkdownString(`**vibeCodeEase: カスタム設定**\n\n${details}\n\nクリックで変更`);
                mdCustom.supportThemeIcons = true;
                this.statusBarItem.tooltip = mdCustom;
                break;
            }
        }
    }

    public dispose() {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

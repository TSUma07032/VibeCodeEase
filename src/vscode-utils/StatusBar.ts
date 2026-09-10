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
                const learningMd = new vscode.MarkdownString('**vibeCodeEase:** 学習モード (*解説ヒント中心*)\n\n---\n\n$(paintcan) クリックでモードを変更します');
                learningMd.supportThemeIcons = true;
                this.statusBarItem.tooltip = learningMd;
                break;
            }
            case 'FLOW': {
                this.statusBarItem.text = '$(zap) Vibe: Flow';
                const flowMd = new vscode.MarkdownString('**vibeCodeEase:** フローモード (*自動修正中心*)\n\n---\n\n$(paintcan) クリックでモードを変更します');
                flowMd.supportThemeIcons = true;
                this.statusBarItem.tooltip = flowMd;
                break;
            }
            case 'ZEN': {
                this.statusBarItem.text = '$(eye-closed) Vibe: Zen';
                const zenMd = new vscode.MarkdownString('**vibeCodeEase:** 職人モード (*介入最小*)\n\n---\n\n$(paintcan) クリックでモードを変更します');
                zenMd.supportThemeIcons = true;
                this.statusBarItem.tooltip = zenMd;
                break;
            }
            case 'CUSTOM': {
                const prefs = state.preferences.preferences;
                const details = Object.entries(prefs)
                    .map(([k, v]) => `"${k}": ${v.toFixed(2)}`)
                    .join(',\n  ');
                this.statusBarItem.text = '$(settings) Vibe: Custom';
                const customMd = new vscode.MarkdownString(`**vibeCodeEase:** カスタム設定\n\n\`\`\`json\n{\n  ${details}\n}\n\`\`\`\n\n---\n\n$(paintcan) クリックでモードを変更します`);
                customMd.supportThemeIcons = true;
                this.statusBarItem.tooltip = customMd;
                break;
            }
        }
    }

    public dispose() {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

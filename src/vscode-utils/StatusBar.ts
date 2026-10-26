import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';

export class VibeStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        );
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

    private createTooltip(modeName: string, desc: string): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.appendMarkdown(
            `**vibeCodeEase: ${modeName}**\n\n${desc}\n\n---\n*$(mouse-left) クリックで変更*`,
        );
        return md;
    }

    public updateState(): void {
        const state = GlobalState.getInstance();
        const preset = state.presetMode;

        switch (preset) {
            case 'HINT':
                this.statusBarItem.text = '$(lightbulb) Vibe: Hint';
                this.statusBarItem.tooltip = this.createTooltip('ヒントモード', '解説ヒント中心');
                break;
            case 'ARCHITECTURE':
                this.statusBarItem.text = '$(versions) Vibe: Architecture';
                this.statusBarItem.tooltip = this.createTooltip(
                    'アーキテクチャモード',
                    'リファクタ中心',
                );
                break;
            case 'BUG_TYPO':
                this.statusBarItem.text = '$(bug) Vibe: Bug/Typo';
                this.statusBarItem.tooltip = this.createTooltip('バグ・タイポ修正', '最小限の修正');
                break;
            case 'CUSTOM': {
                const prefs = state.preferences.preferences;
                const details = Object.entries(prefs)
                    .map(([k, v]) => `- **${k}**: ${v.toFixed(2)}`)
                    .join('\n');
                this.statusBarItem.text = '$(settings) Vibe: Custom';
                this.statusBarItem.tooltip = this.createTooltip('カスタム設定', details);
                break;
            }
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach((d) => {
            d.dispose();
        });
    }
}

/**
 * [Why/Intent] VS Codeステータスバー上にvibeCodeEaseの現在の動作プリセットモード表示と、
 * 設定パネルをワンクリックで起動するための専用アイテム（$(gear)）を登録・管理するモジュール。
 */
import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';

/**
 * [Why/Intent] vibeCodeEaseステータスバー管理クラス。
 * モード切替アイテム（priority: 100）および設定直接起動アイテム（priority: 99）を共存表示する。
 */
export class VibeStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private settingsStatusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        );
        this.statusBarItem.name = 'vibeCodeEase Mode';
        this.statusBarItem.command = 'vibecodeease.switchMode';

        this.settingsStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            99,
        );
        this.settingsStatusBarItem.name = 'vibeCodeEase Settings';
        this.settingsStatusBarItem.command = 'vibecodeease.openSettings';
        this.settingsStatusBarItem.text = '$(gear) vibeCodeEase: 設定';

        const settingsTooltip = new vscode.MarkdownString();
        settingsTooltip.supportThemeIcons = true;
        settingsTooltip.appendMarkdown(
            '**vibeCodeEase: 設定**\n\nAPIキー、モデル選択、推敲設定を開く\n\n---\n*$(mouse-left) クリックで設定を開く*',
        );
        this.settingsStatusBarItem.tooltip = settingsTooltip;

        this.updateState();
        this.statusBarItem.show();
        this.settingsStatusBarItem.show();

        // GlobalState の変更をリッスンして自動更新
        const sub = GlobalState.getInstance().onDidChangeState(() => {
            this.updateState();
        });
        this.disposables.push(sub);
    }

    /**
     * [Why/Intent] モード表示用StatusBarItemを取得する（テスト・検証用）。
     */
    public getModeStatusBarItem(): vscode.StatusBarItem {
        return this.statusBarItem;
    }

    /**
     * [Why/Intent] 設定起動用StatusBarItemを取得する（テスト・検証用）。
     */
    public getSettingsStatusBarItem(): vscode.StatusBarItem {
        return this.settingsStatusBarItem;
    }

    private createTooltip(modeName: string, desc: string): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.appendMarkdown(
            `**vibeCodeEase: ${modeName}**\n\n${desc}\n\n---\n*$(mouse-left) クリックで変更*`,
        );
        return md;
    }

    /**
     * [Why/Intent] GlobalStateの現在の動作プリセットモード（HINT, ARCHITECTURE, BUG_TYPO, CUSTOM）を読み取り、
     * ステータスバーのアイコン、テキスト、およびツールチップの表示内容を最新状態に更新する。
     */
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

    /**
     * [Why/Intent] モード表示アイテム、設定起動アイテム、およびグローバル状態変更リスナーを全て破棄解放し、
     * リソースリークを防止する。
     */
    public dispose(): void {
        this.statusBarItem.dispose();
        this.settingsStatusBarItem.dispose();
        this.disposables.forEach((d) => {
            d.dispose();
        });
    }
}

/**
 * [Why/Intent] vibeCodeEase ステータスバー（VibeStatusBar）の単体テストスイート。
 * 動作モード切り替え用アイテム（priority: 100）と、新設された専用設定アイテム（priority: 99, command: vibecodeease.openSettings）の
 * 初期化プロパティ、アイコン・テキスト、ツールチップ、および破棄処理を検証する。
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { VibeStatusBar } from '../vscode-utils/StatusBar';

suite('VibeStatusBar Unit Test Suite', () => {
    let statusBar: VibeStatusBar | undefined;

    teardown(() => {
        statusBar?.dispose();
        statusBar = undefined;
    });

    test('モード表示アイテムおよび設定直接起動アイテムが正しいプロパティで生成・共存すること', () => {
        statusBar = new VibeStatusBar();

        // モード表示アイテムの検証
        const modeItem = statusBar.getModeStatusBarItem();
        assert.ok(modeItem, 'モード表示用StatusBarItemが生成されていること');
        assert.strictEqual(
            modeItem.alignment,
            vscode.StatusBarAlignment.Right,
            'Rightアライメントであること',
        );
        assert.strictEqual(modeItem.priority, 100, '優先度が100であること');
        assert.strictEqual(
            modeItem.command,
            'vibecodeease.switchMode',
            'コマンドがswitchModeであること',
        );

        // 設定表示アイテムの検証
        const settingsItem = statusBar.getSettingsStatusBarItem();
        assert.ok(settingsItem, '設定起動用StatusBarItemが生成されていること');
        assert.strictEqual(
            settingsItem.alignment,
            vscode.StatusBarAlignment.Right,
            'Rightアライメントであること',
        );
        assert.strictEqual(settingsItem.priority, 99, '優先度が99であること');
        assert.strictEqual(
            settingsItem.command,
            'vibecodeease.openSettings',
            'コマンドがvibecodeease.openSettingsであること',
        );
        assert.strictEqual(
            settingsItem.text,
            '$(gear) vibeCodeEase: 設定',
            'テキストに$(gear)アイコンと設定名称が含まれること',
        );
        assert.strictEqual(
            settingsItem.name,
            'vibeCodeEase Settings',
            'アイテム名がvibeCodeEase Settingsであること',
        );
    });

    test('dispose呼び出し時に両方のStatusBarItemが例外なく安全に破棄されること', () => {
        statusBar = new VibeStatusBar();
        const modeItem = statusBar.getModeStatusBarItem();
        const settingsItem = statusBar.getSettingsStatusBarItem();
        assert.ok(modeItem, 'モード表示アイテムが取得できること');
        assert.ok(settingsItem, '設定起動アイテムが取得できること');

        let modeDisposed = false;
        let settingsDisposed = false;
        const origModeDispose = modeItem.dispose.bind(modeItem);
        modeItem.dispose = () => {
            modeDisposed = true;
            origModeDispose();
        };
        const origSettingsDispose = settingsItem.dispose.bind(settingsItem);
        settingsItem.dispose = () => {
            settingsDisposed = true;
            origSettingsDispose();
        };

        statusBar.dispose();
        assert.strictEqual(modeDisposed, true, 'modeItemのdisposeが呼ばれること');
        assert.strictEqual(settingsDisposed, true, 'settingsItemのdisposeが呼ばれること');
    });
});

/**
 * [Why/Intent] VS Code API と疎結合なサイドバー Webview UI/UX 専用の Playwright E2E テストスイート。
 * VS Code 本体（Electron）を起動することなく、Web 開発サーバー（Vite）と Playwright のモック注入を活用し、
 * 高速かつ安定して全タブの画面遷移、設定フォームの操作、
 * および双方向メッセージング（IPC）を実機ブラウザ（Chromium）上で検証する。
 * 学習支援・ダッシュボード・AI推論デバッグの3タブ破壊後のナビゲーション状態を厳格に保証する。
 */
import { test, expect } from '@playwright/test';

/**
 * [Why/Intent] Playwright のブラウザ実行コンテキスト（window オブジェクト）に対し、
 * VS Code Webview 固有の API（acquireVsCodeApi）のモックおよびテスト検証用メッセージ履歴
 * （__messagesToVsCode）を型安全に注入・参照するためのインターフェース。
 */
interface MockWindow {
  __messagesToVsCode: unknown[];
  acquireVsCodeApi: () => {
    postMessage: (msg: unknown) => void;
    getState: () => Record<string, unknown>;
    setState: (state: Record<string, unknown>) => void;
  };
}

test.describe('vibeCodeEase サイドバー UI/UX ブラウザ連携テスト', () => {
  test.beforeEach(async ({ page }) => {
    // ページロード前に VS Code API のモック関数をブラウザの window オブジェクトに型安全に注入
    await page.addInitScript(() => {
      const mockWin = window as unknown as MockWindow;
      mockWin.__messagesToVsCode = [];
      mockWin.acquireVsCodeApi = () => ({
        postMessage: (msg: unknown) => {
          mockWin.__messagesToVsCode.push(msg);
        },
        getState: () => ({}),
        setState: () => {}
      });
    });

    await page.goto('/');
  });

  test('存続タブ（Code, Settings）のナビゲーション切り替えと破壊タブ（学習支援, Dashboard, AI推論）の完全非存在検証', async ({ page }) => {
    // 1. 初期状態: [💻 Code] タブがアクティブ
    await expect(page.getByText('Waiting for document sync...')).toBeVisible();

    // 2. 破壊された3タブがナビゲーション上に一切存在しないことを検証 (RULE-005)
    await expect(page.getByRole('button', { name: '[🎓 学習支援]' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '[📊 Dashboard]' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '[🐞 AI推論デバッグ]' })).toHaveCount(0);

    // 3. [⚙️ Settings] タブをクリックして設定画面が表示されること
    await page.getByRole('button', { name: '[⚙️ Settings]' }).click();
    await expect(page.getByRole('button', { name: '🔧 全般・自動推敲' })).toBeVisible();

    // 4. 再び [💻 Code] タブをクリックしてエディタ画面に戻れること
    await page.getByRole('button', { name: '[💻 Code]' }).click();
    await expect(page.getByText('Waiting for document sync...')).toBeVisible();
  });

  test('設定タブのサブタブ切替・設定変更・保存メッセージ送信検証', async ({ page }) => {
    // 1. 設定タブへ切り替え
    await page.getByRole('button', { name: '[⚙️ Settings]' }).click();

    // 2. 学習支援設定サブタブを選択
    await page.getByRole('button', { name: '🎓 学習支援設定' }).click();

    // 3. 初期設定同期メッセージを発行（スケルトン解消）
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'SYNC_LEARNING_CONFIG',
          payload: {
            intervalSeconds: 30,
            debounceMs: 5000,
            stagnationThresholdN: 3,
            progressDeltaThreshold: 5,
            snoozeMinutes: 5,
            defaultDisclosureMode: 'stepByStep',
            pauseExistingAnalysisDuringLearning: true
          }
        }
      }));
    });

    // 4. 停滞判定回数入力欄に 4 を入力
    const thresholdInput = page.locator('#stagnationThresholdN');
    await expect(thresholdInput).toBeVisible();
    await thresholdInput.fill('4');

    // 5. 設定保存ボタンをクリック
    const saveButton = page.getByRole('button', { name: '💾 設定を保存する' });
    await saveButton.click();

    // 6. VS Code 向け送信メッセージの検証
    const messages = await page.evaluate(() => {
      const mockWin = window as unknown as MockWindow;
      return mockWin.__messagesToVsCode;
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'UPDATE_LEARNING_CONFIG',
          payload: expect.objectContaining({
            stagnationThresholdN: 4
          })
        })
      ])
    );
  });

  test('VS Code からの設定同期（双方向バインド）検証', async ({ page }) => {
    // 設定タブ ➜ 学習支援設定へ切り替え
    await page.getByRole('button', { name: '[⚙️ Settings]' }).click();
    await page.getByRole('button', { name: '🎓 学習支援設定' }).click();

    // VS Code から設定同期メッセージを受信
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'SYNC_LEARNING_CONFIG',
          payload: {
            intervalSeconds: 30,
            debounceMs: 5000,
            stagnationThresholdN: 5,
            progressDeltaThreshold: 5,
            snoozeMinutes: 5,
            defaultDisclosureMode: 'stepByStep',
            pauseExistingAnalysisDuringLearning: true
          }
        }
      }));
    });

    // input の value が同期値 '5' に更新されていることを確認
    const thresholdInput = page.locator('#stagnationThresholdN');
    await expect(thresholdInput).toHaveValue('5');
  });
});

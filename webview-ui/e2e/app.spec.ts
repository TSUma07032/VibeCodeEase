import { test, expect } from '@playwright/test';

test.describe('vibeCodeEase Webview UI (Gemini Proposal E2E テスト)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__messagesToVsCode = [];
      (window as any).acquireVsCodeApi = () => ({
        postMessage: (msg: any) => {
          (window as any).__messagesToVsCode.push(msg);
        },
        getState: () => ({}),
        setState: () => {}
      });
    });

    await page.goto('/');
  });

  test('画面の初期化時に webviewReady が送信されること', async ({ page }) => {
    // ヘッダータイトルの確認
    const heading = page.locator('h2');
    await expect(heading).toHaveText('AI Workspace');

    // 起動時に webviewReady が送信されたか
    const messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([{ command: 'webviewReady' }])
    );
  });

  test('Syncボタンをクリックすると syncCurrentCode が送信されること', async ({ page }) => {
    const syncBtn = page.getByRole('button', { name: '🔄 Sync' });
    await syncBtn.click();

    const messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([{ command: 'syncCurrentCode' }])
    );
  });

  test('Geminiからの提案を受信し、アイコン表示後、クリックでエディタ反映の通信が送られること', async ({ page }) => {
    // 1. Extensionからの返信(Geminiの提案)をシミュレート
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            command: 'aiProposalsComplete',
            data: {
              proposals: [
                {
                  id: '1234567890',
                  isAiPush: true,
                  explanation: 'Gemini APIからのコード提案',
                  originalText: 'console.log("old");',
                  proposedText: 'console.log("new");'
                }
              ]
            }
          }
        })
      );
    });

    // 2. GUI上にアイコン(✨)と提案が表示されることを確認
    await expect(page.locator('text=✨')).toBeVisible();
    await expect(page.locator('text=AI Push')).toBeVisible();

    // 3. Diffを表示するためにアコーディオンを開く
    await page.locator('.proposal-header').click();
    await expect(page.locator('text=Gemini APIからのコード提案')).toBeVisible();

    // 4. 「⬇️ Pull (Cherry-pick)」アイコン/ボタンをクリック
    const applyBtn = page.getByRole('button', { name: '⬇️ Pull (Cherry-pick)' });
    await applyBtn.click();

    // 5. バックエンド（編集環境）へ反映用の通信が送られたことを確認
    const messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'acceptProposal',
          proposal: expect.objectContaining({ id: '1234567890' })
        })
      ])
    );
  });
});


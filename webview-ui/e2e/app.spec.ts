import { test, expect } from '@playwright/test';

test.describe('vibeCodeEase Webview UI (実画面 E2E テスト)', () => {
  test.beforeEach(async ({ page }) => {
    // ページロード前に VS Code API をブラウザの window オブジェクトに注入
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

  test('画面が正常に表示され、GET_SETTINGS が送信されること', async ({ page }) => {
    // ヘッダータイトルの確認
    const heading = page.locator('h1');
    await expect(heading).toHaveText('✨ vibeCodeEase');

    // プリセットセクションの確認
    await expect(page.locator('text=🎓 学習モード (Learning)')).toBeVisible();
    await expect(page.locator('text=⚡ フローモード (Flow)')).toBeVisible();
    await expect(page.locator('text=🛠️ 職人モード (Zen)')).toBeVisible();
    await expect(page.locator('text=⚙️ カスタム調整 (Custom)')).toBeVisible();

    // 起動時に GET_SETTINGS が送信されたか
    const messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([{ command: 'GET_SETTINGS' }])
    );
  });

  test('プリセットカードをクリックしてモードを切り替えられること', async ({ page }) => {
    // 「⚡ フローモード」をクリック
    const flowCard = page.locator('.preset-card', { hasText: 'フローモード' });
    await flowCard.click();

    // active クラスが付くことを確認
    await expect(flowCard).toHaveClass(/active/);

    // 「🛠️ 職人モード」をクリック
    const zenCard = page.locator('.preset-card', { hasText: '職人モード' });
    await zenCard.click();

    await expect(zenCard).toHaveClass(/active/);
    await expect(flowCard).not.toHaveClass(/active/);

    // VS Code へ SET_PRESET メッセージが送信されたことを確認
    const messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([
        { command: 'SET_PRESET', payload: 'FLOW' },
        { command: 'SET_PRESET', payload: 'ZEN' }
      ])
    );
  });

  test('スライダーを操作するとカスタムモードになり設定値が送信されること', async ({ page }) => {
    // 最初のスライダー（タイポ）を操作
    const firstSlider = page.locator('input[type="range"]').first();
    await firstSlider.fill('0.95');

    // カスタム調整カードが active になることを確認
    const customCard = page.locator('.preset-card', { hasText: 'カスタム調整' });
    await expect(customCard).toHaveClass(/active/);

    // UPDATE_PREFERENCE_VALUE が送信されたことを確認
    const messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([
        {
          command: 'UPDATE_PREFERENCE_VALUE',
          payload: { category: 'SYNTAX_TYPO', value: 0.95 }
        }
      ])
    );
  });

  test('解析ボタンのクリックからプラン表示・承認までの一連のフローが動くこと', async ({ page }) => {
    // 「現在のファイルを解析」ボタンをクリック
    const analyzeBtn = page.getByRole('button', { name: /現在のファイルを解析/ });
    await analyzeBtn.click();

    // ANALYZE_CURRENT_FILE が送信されたことを確認
    let messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([{ command: 'ANALYZE_CURRENT_FILE' }])
    );

    // 拡張機能からプランデータを受信した状況をシミュレート
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'INTERVENTION_PLAN',
            payload: {
              summary: 'タイポ1件の自動修正を提案します',
              edits: [
                {
                  startLine: 0,
                  startCharacter: 0,
                  endLine: 0,
                  endCharacter: 7,
                  newText: 'function',
                  category: 'SYNTAX_TYPO',
                  reason: 'functon を修正'
                }
              ]
            }
          }
        })
      );
    });

    // プランセクションが表示されること
    await expect(page.locator('text=📋 介入プラン')).toBeVisible();
    await expect(page.locator('text=タイポ1件の自動修正を提案します')).toBeVisible();
    await expect(page.locator('text=functon を修正')).toBeVisible();

    // 「承認して適用」ボタンをクリック
    const applyBtn = page.getByRole('button', { name: '承認して適用' });
    await applyBtn.click();

    // APPLY_PLAN が送信されたことを確認
    messages = await page.evaluate(() => (window as any).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([{ command: 'APPLY_PLAN' }])
    );
  });
});

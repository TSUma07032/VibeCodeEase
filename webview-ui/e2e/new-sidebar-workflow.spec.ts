/**
 * [Why/Intent] ユーザー要望の7つの改善（常設サイドバー、簡易設定バー、ペルソナ履歴維持、
 * 変更方針の修正・再推敲、一覧への復帰、MirrorEditor撤廃）が
 * 実機ブラウザ（Chromium）上で正常に動作し、UI崩れやコンソールエラーが一切ないことを保証する
 * Playwright E2E 実ブラウザ自動検証スイート。
 */
import { test, expect } from '@playwright/test';

interface MockWindow {
  __messagesToVsCode: unknown[];
  acquireVsCodeApi: () => {
    postMessage: (msg: unknown) => void;
    getState: () => Record<string, unknown>;
    setState: (state: Record<string, unknown>) => void;
  };
}

test.describe('vibeCodeEase 新サイドバー UI/UX 実ブラウザ検証', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

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

  test('初期ビュー (SidebarInitialView) のコンポーネント描画とコンソールエラー0件の検証', async ({ page }) => {
    // 1. 簡易設定バーの項目が存在すること
    await expect(page.getByText('⚡ 簡易設定')).toBeVisible();
    await expect(page.getByLabel('ペルソナ')).toBeVisible();
    await expect(page.getByLabel('介入トリガー')).toBeVisible();
    await expect(page.getByLabel('モデル')).toBeVisible();

    // 2. APIキー管理セクションが存在すること
    await expect(page.getByText('🔑 Gemini API Key')).toBeVisible();

    // 3. 提案依頼リストセクションが存在すること
    await expect(page.getByText('📋 提案・依頼リスト')).toBeVisible();
    await expect(page.getByText('現在、未対応の改善提案はありません。')).toBeVisible();

    // 4. 重複エディタ (CodeUI / MirrorEditor) や旧タブバーが非存在であること
    await expect(page.getByRole('button', { name: '[💻 Code]' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '[⚙️ Settings]' })).toHaveCount(0);
    await expect(page.getByText('Waiting for document sync...')).toHaveCount(0);

    // 5. ブラウザコンソールエラーが0件であること
    expect(consoleErrors).toEqual([]);
  });

  test('簡易設定の変更操作で VS Code への設定通知メッセージが送信されること', async ({ page }) => {
    // ペルソナを「concise (AI 簡潔・要点)」に変更
    await page.getByLabel('ペルソナ').selectOption('concise');

    // 介入トリガーを「手動実行のみ」に変更
    await page.getByLabel('介入トリガー').selectOption('manual');

    // VS Code へ postMessage が送信されたことを検証
    const messages = await page.evaluate(() => (window as unknown as MockWindow).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'UPDATE_QUICK_SETTINGS',
          payload: expect.objectContaining({
            personaId: 'concise',
          }),
        }),
        expect.objectContaining({
          type: 'UPDATE_QUICK_SETTINGS',
          payload: expect.objectContaining({
            frequency: 'manual',
          }),
        }),
      ])
    );
  });

  test('提案カード選択 ➜ 対話ビュー遷移 ➜ 方針修正入力 ➜ 一覧へ戻る の一連のユーザーフロー検証', async ({ page }) => {
    // 1. VS Code から履歴状態同期イベントを受信
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_HISTORY_STATE',
            payload: {
              interventions: [
                {
                  id: 'prop-e2e-1',
                  title: '型アノテーションの追加',
                  summary: '明示的な型アノテーションを付与することを推奨します',
                  range: { start: { line: 10, character: 0 }, end: { line: 12, character: 10 } },
                  status: 'pending',
                  personaId: 'mentor',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
          },
        })
      );
    });

    // 提案カードが表示されること
    const proposalButton = page.getByRole('button', { name: /型アノテーションの追加/ });
    await expect(proposalButton).toBeVisible();

    // 2. 提案カードをクリックして対話ビューへ遷移
    await proposalButton.click();

    // 対話ビューの要素が表示されること
    await expect(page.getByRole('button', { name: '⬅️ 一覧・簡易設定に戻る' })).toBeVisible();
    await expect(page.getByText('💡 変更方針の修正')).toBeVisible();
    await expect(page.getByRole('button', { name: '⏩ 適用' })).toBeVisible();
    await expect(page.getByRole('button', { name: '⏪ アンドゥ' })).toBeVisible();
    await expect(page.getByRole('button', { name: '🗑️ 却下' })).toBeVisible();

    // 3. 方針修正フォームに入力して再推敲を要求
    const refineInput = page.getByPlaceholder('こういう方向で変えて？');
    await expect(refineInput).toBeVisible();
    await refineInput.fill('as const も追加してください');

    const refineButton = page.getByRole('button', { name: '🔄 この方針でコードを再生成' });
    await refineButton.click();

    // VS Code へ REFINE_INTERVENTION が送信されたことを検証
    const messages = await page.evaluate(() => (window as unknown as MockWindow).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'REFINE_INTERVENTION',
          payload: expect.objectContaining({
            interventionId: 'prop-e2e-1',
            userInstruction: 'as const も追加してください',
          }),
        }),
      ])
    );

    // 4. 「⬅️ 一覧・簡易設定に戻る」ボタンをクリック
    await page.getByRole('button', { name: '⬅️ 一覧・簡易設定に戻る' }).click();

    // 初期ビュー（簡易設定 ＆ 提案リスト）に安全に戻ったことを検証
    await expect(page.getByText('⚡ 簡易設定')).toBeVisible();
    await expect(page.getByText('📋 提案・依頼リスト')).toBeVisible();
    await expect(page.getByRole('button', { name: '⬅️ 一覧・簡易設定に戻る' })).toHaveCount(0);

    // ブラウザコンソールエラーが0件であること
    expect(consoleErrors).toEqual([]);
  });
});

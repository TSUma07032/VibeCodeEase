import { test, expect } from '@playwright/test';

interface MockWindow {
  __messagesToVsCode: unknown[];
  acquireVsCodeApi: () => {
    postMessage: (msg: unknown) => void;
    getState: () => Record<string, unknown>;
    setState: (state: Record<string, unknown>) => void;
  };
}

test.describe('vibeCodeEase Webview UI (実画面 E2E テスト)', () => {
  test.beforeEach(async ({ page }) => {
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

  test('初期起動時に ready コマンドが送信され、ドキュメント同期後にミラーエディタが表示されること', async ({ page }) => {
    await expect(page.getByText('Waiting for document sync...')).toBeVisible();

    const messages = await page.evaluate(() => (window as unknown as MockWindow).__messagesToVsCode);
    expect(messages).toEqual(expect.arrayContaining([{ command: 'ready' }]));

    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_DOCUMENT',
            fileName: '/workspace/src/index.ts',
            text: 'functon greet() {\n  return "hello";\n}'
          }
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'UPDATE_INTERVENTIONS',
            interventions: [
              {
                id: 'proposal-1',
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                originalText: 'functon',
                replacementText: 'function',
                message: '予約語 function のタイポを修正します'
              }
            ]
          }
        })
      );
    });

    await expect(page.getByText('index.ts')).toBeVisible();
    await expect(page.getByTitle('View AI Proposal')).toBeVisible();

    await page.getByTitle('View AI Proposal').click();
    await expect(page.getByText('予約語 function のタイポを修正します')).toBeVisible();

    await page.getByRole('button', { name: '[反映 (Accept)]' }).click();
    const updatedMessages = await page.evaluate(() => (window as unknown as MockWindow).__messagesToVsCode);
    expect(updatedMessages).toEqual(
      expect.arrayContaining([
        {
          command: 'apply_intervention',
          id: 'proposal-1',
          newText: 'function',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } }
        }
      ])
    );
  });

  test('設定タブで API キーのフォーカス後に未入力でフォーカスを外しても既存キーが消去されないこと', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_SETTINGS',
            hasApiKey: true,
            apiKeyLength: 10,
            interventionLevel: 'Level 2 (Refactoring)',
            frequency: 'onSave',
            intervalSeconds: 15,
            model: 'gemini-3.5-flash-lite'
          }
        })
      );
    });

    await page.getByRole('button', { name: '[⚙️ Settings]' }).click();
    await expect(page.getByText('✅ APIキー設定済み')).toBeVisible();

    const apiKeyInput = page.locator('input[type="password"]');
    await apiKeyInput.focus();
    await apiKeyInput.blur();

    const messages = await page.evaluate(() => (window as unknown as MockWindow).__messagesToVsCode);
    const apiKeyCommands = messages.filter(
      (m) => typeof m === 'object' && m !== null && (m as { command?: string }).command === 'update_api_key'
    );
    expect(apiKeyCommands).toHaveLength(0);
  });
});


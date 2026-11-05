/**
 * [Why/Intent] CodeタブのGitHub風Unified Diffビューおよび3段階アクション（即座採用、即座破棄、理由提示下での判断）を
 * 実ブラウザ（Chromium）上で検証するPlaywright E2Eテストスイート。
 */
import { test, expect } from '@playwright/test';

/**
 * [Why/Intent] acquireVsCodeApi モックおよび送信メッセージを型安全に保持するためのインターフェース。
 */
interface MockWindow {
  __messagesToVsCode: Array<{ command: string; id?: string }>;
  acquireVsCodeApi: () => {
    postMessage: (msg: { command: string; id?: string }) => void;
    getState: () => Record<string, unknown>;
    setState: (state: Record<string, unknown>) => void;
  };
}

test.describe('Code Tab GitHub-like Diff View & 3-Step Actions', () => {
    test('実ブラウザ上でGitHub風差分が左揃えツールバーで表示され、3段階アクションが動作すること', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        // acquireVsCodeApi モック注入
        await page.addInitScript(() => {
            const mockWin = window as unknown as MockWindow;
            mockWin.__messagesToVsCode = [];
            mockWin.acquireVsCodeApi = () => ({
                postMessage: (msg: { command: string; id?: string }) => {
                    mockWin.__messagesToVsCode.push(msg);
                },
                setState: () => {},
                getState: () => ({})
            });
        });

        await page.goto('/');

        // IPCメッセージを注入してドキュメントと介入を表示
        await page.evaluate(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'SYNC_DOCUMENT',
                        fileName: '/workspace/src/example.ts',
                        text: 'const add = (a: any, b: any) => {\n  return a + b;\n};\nconsole.log(add(1, 2));'
                    }
                })
            );
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'UPDATE_INTERVENTIONS',
                        interventions: [
                            {
                                id: 'intervention-github-diff-1',
                                range: { start: { line: 0, character: 0 }, end: { line: 2, character: 2 } },
                                originalText: 'const add = (a: any, b: any) => {\n  return a + b;\n};',
                                replacementText: 'const add = (a: number, b: number): number => {\n  return a + b;\n};',
                                message: 'TypeScriptの厳格な型安全性を確保するため、引数と戻り値に型注釈を付与しました。'
                            }
                        ]
                    }
                })
            );
        });

        // 1. 差分ブロック外枠の検証
        const diffView = page.getByTestId('github-diff-view-intervention-github-diff-1');
        await expect(diffView).toBeVisible();
        await expect(diffView).toHaveAttribute('role', 'region');
        await expect(diffView).toHaveAttribute('aria-label', 'AIコード変更提案');

        // 2. ツールバーの左揃え検証
        const toolbar = page.getByTestId('diff-toolbar');
        await expect(toolbar).toBeVisible();
        const justify = await toolbar.evaluate(el => window.getComputedStyle(el).justifyContent);
        expect(justify).toBe('flex-start');

        // 3. ボタン3種の検証（[採用], [破棄], [ 理由を確認 ▾ ]）
        const acceptBtn = page.getByTestId('diff-accept-btn');
        const discardBtn = page.getByTestId('diff-discard-btn');
        const reasonToggleBtn = page.getByTestId('diff-reason-toggle-btn');

        await expect(acceptBtn).toHaveText('[採用]');
        await expect(discardBtn).toHaveText('[破棄]');
        await expect(reasonToggleBtn).toHaveText('[ 理由を確認 ▾ ]');

        // 4. 旧電球アイコン（💡）や撤廃文字列が存在しないことの非存在検証 (RULE-005)
        const bulbIcon = page.locator('button[title="View AI Proposal"]');
        await expect(bulbIcon).toHaveCount(0);
        await expect(page.getByText('@@ AI Suggestion @@')).toHaveCount(0);

        // 5. 理由開閉アコーディオンの動作検証（3段階目：理由提示下での判断）
        await expect(page.getByTestId('diff-reason-content')).toHaveCount(0);
        await reasonToggleBtn.click();

        await expect(reasonToggleBtn).toHaveText('[ 理由を閉じる ▴ ]');
        const reasonContent = page.getByTestId('diff-reason-content');
        await expect(reasonContent).toBeVisible();
        await expect(reasonContent).toContainText('【推敲理由】');
        await expect(reasonContent).not.toContainText('💡');
        await expect(reasonContent).toContainText('TypeScriptの厳格な型安全性を確保するため');

        // 再度クリックして閉じる
        await reasonToggleBtn.click();
        await expect(reasonToggleBtn).toHaveText('[ 理由を確認 ▾ ]');
        await expect(page.getByTestId('diff-reason-content')).toHaveCount(0);

        // 6. 採用ボタンクリック検証
        await acceptBtn.click();
        const messages = await page.evaluate(() => {
            const mockWin = window as unknown as MockWindow;
            return mockWin.__messagesToVsCode;
        });
        const applyMsg = messages.find((m) => m.command === 'apply_intervention');
        expect(applyMsg).toBeDefined();
        expect(applyMsg?.id).toBe('intervention-github-diff-1');

        // コンソールエラー0件検証
        expect(consoleErrors).toHaveLength(0);
    });
});

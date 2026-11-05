/**
 * [Why/Intent] 専用コマンド「vibeCodeEase: 設定を開く」およびステータスバー導線による
 * Webview設定パネル起動のPlaywright E2Eテストスイート。
 * NAVIGATE_TO_SETTINGS メッセージ受信時の画面遷移、オンデマンド詳細からの復帰、
 * 設定UIの操作性とIPC送信、および実ブラウザ上でのコンソールエラー0件を検証する。
 */
import { expect, test } from '@playwright/test';

/**
 * [Why/Intent] Playwrightブラウザコンテキストに対しVS Code Webview固有API（acquireVsCodeApi）および
 * 拡張機能側への送信メッセージを傍受・記録する配列を型安全に注入するためのモックWindow型定義。
 */
interface MockWindow {
    __messagesToVsCode: unknown[];
    acquireVsCodeApi: () => {
        postMessage: (msg: unknown) => void;
        getState: () => Record<string, unknown>;
        setState: (state: Record<string, unknown>) => void;
    };
}

test.describe('Open Settings Command E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const mockWin = window as unknown as MockWindow;
            mockWin.__messagesToVsCode = [];
            mockWin.acquireVsCodeApi = () => ({
                postMessage: (msg: unknown) => {
                    mockWin.__messagesToVsCode.push(msg);
                },
                getState: () => ({}),
                setState: () => {},
            });
        });

        await page.goto('/');
    });

    test('通常表示中に NAVIGATE_TO_SETTINGS を受信した際、設定パネルが描画されUI操作可能であること（コンソールエラー0件）', async ({
        page,
    }) => {
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        page.on('pageerror', (err) => {
            consoleErrors.push(err.message);
        });

        // 1. 初期表示確認
        await expect(page.getByText('Waiting for document sync...')).toBeVisible();

        // 2. NAVIGATE_TO_SETTINGS メッセージを受信
        await page.evaluate(() => {
            window.postMessage(
                {
                    type: 'NAVIGATE_TO_SETTINGS',
                },
                '*',
            );
        });

        // 3. SettingsPanel が表示されたことを検証
        await expect(page.getByText('設定カテゴリ:')).toBeVisible();
        const apiKeyInput = page.getByPlaceholder('Enter API Key');
        await expect(apiKeyInput).toBeVisible();

        // [仕様書準拠] 推敲レベルおよびモデル選択の表示確認
        await expect(page.getByText('AI Intervention Level')).toBeVisible();
        await expect(page.getByText('Model')).toBeVisible();

        // 4. APIキー入力とIPCメッセージ送信を検証
        await apiKeyInput.fill('test-gemini-api-key');
        await apiKeyInput.blur();

        const messages = await page.evaluate(() => {
            return (window as unknown as MockWindow).__messagesToVsCode;
        });
        expect(
            messages.some(
                (m) =>
                    typeof m === 'object' &&
                    m !== null &&
                    (m as { command?: string }).command === 'update_api_key' &&
                    (m as { apiKey?: string }).apiKey === 'test-gemini-api-key',
            ),
        ).toBe(true);

        // 5. コンソールエラーが0件であることを検証
        expect(consoleErrors).toEqual([]);
    });

    test('オンデマンド詳細表示中に NAVIGATE_TO_SETTINGS を受信した際、詳細が解除され設定画面へ遷移すること（コンソールエラー0件）', async ({
        page,
    }) => {
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        page.on('pageerror', (err) => {
            consoleErrors.push(err.message);
        });

        // 1. EXPAND_INTERVENTION_DETAIL を送信してオンデマンド2カラムを表示
        await page.evaluate(() => {
            window.postMessage(
                {
                    type: 'EXPAND_INTERVENTION_DETAIL',
                    payload: {
                        interventionId: 'e2e-int-settings-001',
                        persona: 'concise',
                        detail: {
                            id: 'e2e-int-settings-001',
                            title: 'E2E Refactoring Proposal',
                            summary: 'Refactor for cleaner architecture',
                            range: {
                                start: { line: 0, character: 0 },
                                end: { line: 0, character: 20 },
                            },
                            status: 'pending',
                            personaId: 'concise',
                            originalCode: 'const oldVar = 1;',
                            proposedCode: 'const newVar = 2;',
                            createdAt: '2026-11-05T00:00:00.000Z',
                            updatedAt: '2026-11-05T00:00:00.000Z',
                            chatHistory: [],
                        },
                    },
                },
                '*',
            );
        });

        await expect(page.getByText('E2E Refactoring Proposal')).toBeVisible();

        // 2. NAVIGATE_TO_SETTINGS メッセージを受信
        await page.evaluate(() => {
            window.postMessage(
                {
                    type: 'NAVIGATE_TO_SETTINGS',
                },
                '*',
            );
        });

        // 3. オンデマンド表示が解除され、設定パネルが表示されること
        await expect(page.getByText('E2E Refactoring Proposal')).not.toBeVisible();
        await expect(page.getByText('設定カテゴリ:')).toBeVisible();
        await expect(page.getByText('AI Intervention Level')).toBeVisible();
        await expect(page.getByText('Model')).toBeVisible();

        // 4. コンソールエラーが0件であることを検証
        expect(consoleErrors).toEqual([]);
    });
});

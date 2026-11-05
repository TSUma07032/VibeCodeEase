/**
 * [Why/Intent] オンデマンドWebviewサイドパネルのPlaywright E2Eテストスイート。
 * VS Code本体を起動せず、MockWindowによりacquireVsCodeApiとIPCメッセージを注入し、
 * 左右2カラムレイアウト、ボタングループ（アンドゥ/適用/却下）、ペルソナ切替、チャット送信、
 * およびコンソールエラー0件を実ブラウザ上で厳格に検証する。
 */
import { expect, test } from '@playwright/test';

interface MockWindow {
    __messagesToVsCode: unknown[];
    acquireVsCodeApi: () => {
        postMessage: (msg: unknown) => void;
        getState: () => Record<string, unknown>;
        setState: (state: Record<string, unknown>) => void;
    };
}

test.describe('OnDemand Side Panel E2E Tests', () => {
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

    test('EXPAND_INTERVENTION_DETAIL 受信時の2カラム描画、ボタン操作・ペルソナ切替・チャット送信IPCとコンソールエラー0件検証', async ({
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

        // 1. EXPAND_INTERVENTION_DETAIL を送信してオンデマンド表示に切り替え
        await page.evaluate(() => {
            window.postMessage(
                {
                    type: 'EXPAND_INTERVENTION_DETAIL',
                    payload: {
                        interventionId: 'e2e-int-001',
                        persona: 'concise',
                        detail: {
                            id: 'e2e-int-001',
                            title: 'forEachをreduceに変更',
                            summary: '配列走査を集約して宣言的改善',
                            range: {
                                start: { line: 12, character: 4 },
                                end: { line: 14, character: 7 },
                            },
                            status: 'pending',
                            personaId: 'concise',
                            originalCode:
                                'items.forEach(item => {\n    total += item.price * item.quantity;\n});',
                            proposedCode:
                                'return items.reduce((acc, item) => {\n    return acc + (item.price * item.quantity);\n}, 0);',
                            createdAt: '2026-11-05T12:00:00.000Z',
                            updatedAt: '2026-11-05T12:00:00.000Z',
                            chatHistory: [
                                {
                                    id: 'msg-001',
                                    sender: 'ai',
                                    message: '配列走査をreduceに集約しました。',
                                    timestamp: '2026-11-05T12:00:00.000Z',
                                },
                            ],
                        },
                    },
                },
                '*',
            );
        });

        // 2. 左右2カラムおよび要素の描画確認
        await expect(page.getByTestId('diff-column')).toBeVisible();
        await expect(page.getByTestId('chat-column')).toBeVisible();
        await expect(page.getByText('forEachをreduceに変更')).toBeVisible();

        // 3. pending 状態のボタン活性確認
        await expect(page.getByRole('button', { name: /提案を取り消す/i })).toBeDisabled();
        const applyBtn = page.getByRole('button', { name: /提案を適用/i });
        await expect(applyBtn).toBeEnabled();

        // 4. 「提案を適用」ボタンクリック ➜ APPLY_INTERVENTION 発行確認
        await applyBtn.click();
        const messagesAfterApply = await page.evaluate(() => {
            const mockWin = window as unknown as MockWindow;
            return mockWin.__messagesToVsCode;
        });
        expect(
            messagesAfterApply.some(
                (m) =>
                    typeof m === 'object' &&
                    m !== null &&
                    'type' in m &&
                    (m as { type: string }).type === 'APPLY_INTERVENTION',
            ),
        ).toBe(true);

        // 5. ペルソナ切替 ➜ SWITCH_PERSONA 発行確認
        const personaSelect = page.getByRole('combobox', { name: /ペルソナ/i });
        await personaSelect.selectOption('architect');
        const messagesAfterSwitch = await page.evaluate(() => {
            const mockWin = window as unknown as MockWindow;
            return mockWin.__messagesToVsCode;
        });
        expect(
            messagesAfterSwitch.some(
                (m) =>
                    typeof m === 'object' &&
                    m !== null &&
                    'type' in m &&
                    (m as { type: string }).type === 'SWITCH_PERSONA',
            ),
        ).toBe(true);

        // 6. チャット送信 ➜ SEND_CHAT_MESSAGE 発行確認
        const textarea = page.getByPlaceholderText(/AIと対話・追加指示/i);
        await textarea.fill('別解も教えて');
        await page.getByRole('button', { name: /送信/i }).click();

        const messagesAfterChat = await page.evaluate(() => {
            const mockWin = window as unknown as MockWindow;
            return mockWin.__messagesToVsCode;
        });
        expect(
            messagesAfterChat.some(
                (m) =>
                    typeof m === 'object' &&
                    m !== null &&
                    'type' in m &&
                    (m as { type: string }).type === 'SEND_CHAT_MESSAGE',
            ),
        ).toBe(true);

        // 7. 実ブラウザコンソールエラー0件検証
        expect(consoleErrors).toEqual([]);
    });
});

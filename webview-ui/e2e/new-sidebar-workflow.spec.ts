/**
 * [Why/Intent] サイドバーUI/UX改善（全面展開「💻 AI作業コード（新提案インライン表示＋過去提案は右端のちっちゃいアイコン＆押下でAI作業コード上でもインライン展開）」、
 * 最下部「📋 提案・依頼リスト（過去介入も含むトグル式掲示板、before/after/採用・却下・詳細）」、
 * 2番目以降の「詳細」押下時の該当チャット表示、設定トグルボタン、横幅固定、AI対話画面の視認性向上、
 * ペルソナ別初手セリフ、提案却下フィードバック、一覧への復帰）が
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

  test('初期ビュー (SidebarInitialView) の全面AI作業コード・最下部掲示板配置・設定トグル・コンソールエラー0件の検証', async ({ page }) => {
    // 1. 全面展開の「💻 AI作業コード」と最下部の「📋 提案・依頼リスト（掲示板）」および「⚙️ 設定」ボタンが存在すること
    await expect(page.getByTestId('ai-workspace-code')).toBeVisible();
    await expect(page.getByText('💻 AI作業コード')).toBeVisible();
    await expect(page.getByTestId('intervention-bulletin-board')).toBeVisible();
    await expect(page.getByText('📋 提案・依頼リスト')).toBeVisible();
    await expect(page.getByText('現在、未対応の改善提案はありません。')).toBeVisible();
    const settingsBtn = page.getByTestId('toggle-settings-btn');
    await expect(settingsBtn).toBeVisible();

    // 2. 「⚙️ 設定」ボタンを押すと簡易設定・APIキー管理セクションが展開されること
    await settingsBtn.click();
    await expect(page.getByText('⚡ 簡易設定')).toBeVisible();
    await expect(page.getByLabel('ペルソナ')).toBeVisible();
    await expect(page.getByLabel('介入トリガー')).toBeVisible();
    await expect(page.getByLabel('モデル')).toBeVisible();
    await expect(page.getByText('🔑 Gemini API Key')).toBeVisible();

    // 3. 旧タブバーが非存在であること
    await expect(page.getByRole('button', { name: '[💻 Code]' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '[⚙️ Settings]' })).toHaveCount(0);
    await expect(page.getByText('Waiting for document sync...')).toHaveCount(0);

    // 4. ブラウザコンソールエラーが0件であること
    expect(consoleErrors).toEqual([]);
  });

  test('簡易設定の変更操作で VS Code への設定通知メッセージが送信されること', async ({ page }) => {
    // 設定パネルを開く
    await page.getByTestId('toggle-settings-btn').click();

    // ペルソナを「concise (⚡ 最短修正・要点のみ)」に変更
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

  test('全面AI作業コード（新提案インライン＆過去提案右端アイコン押下でAI作業コード上にも展開）＋最下部掲示板トグル展開 ➜ 2番目の提案の「詳細」から対話ビュー遷移 ➜ チャット送信・破棄 ➜ 一覧へ戻る の一連フロー検証', async ({ page }) => {
    const initialContainerBox = await page.locator('.sidebar-container').boundingBox();

    // 1. VS Code からドキュメント同期＆複数の介入履歴状態同期イベントを受信（過去の適用済＋未対応の複数件）
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_DOCUMENT',
            fileName: 'src/demo.ts',
            text: [
              'const oldVal = 1;',
              'export function greet(name) {',
              '  return name;',
              '}',
            ].join('\n'),
          },
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_HISTORY_STATE',
            payload: {
              interventions: [
                {
                  id: 'prop-e2e-1',
                  title: '過去のリファクタリング提案',
                  summary: '既に適用された1番目の提案です',
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 15 } },
                  status: 'applied',
                  personaId: 'mentor',
                  originalCode: 'var oldVal = 1;',
                  proposedCode: 'const oldVal = 1;',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                {
                  id: 'prop-e2e-2',
                  title: '型アノテーションの追加',
                  summary: '明示的な型アノテーションを付与することを推奨します',
                  range: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
                  status: 'pending',
                  personaId: 'mentor',
                  originalCode: 'function greet(name) { return name; }',
                  proposedCode: 'function greet(name: string): string { return name; }',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
          },
        })
      );
    });

    // AI作業コード上で、過去の提案（prop-e2e-1）は行右端のちっちゃいアイコン（✓介入1）、
    // 新しい提案（prop-e2e-2）はインラインボックスとして表示されること
    const pastIcon1 = page.getByTestId('workspace-past-icon-prop-e2e-1');
    await expect(pastIcon1).toBeVisible();
    await expect(pastIcon1).toContainText('✓介入1');
    await expect(page.getByTestId('workspace-pending-box-prop-e2e-2')).toBeVisible();

    // 過去分アイコン（✓介入1）を押すと、新提案と同じように「AI作業コード側でも」インラインボックス（workspace-past-box-prop-e2e-1）が開くこと
    await expect(page.getByTestId('workspace-past-box-prop-e2e-1')).toHaveCount(0);
    await pastIcon1.click();
    await expect(page.getByTestId('workspace-past-box-prop-e2e-1')).toBeVisible();
    await expect(page.getByTestId('workspace-before-prop-e2e-1')).toContainText('- var oldVal = 1;');
    await expect(page.getByTestId('workspace-after-prop-e2e-1')).toContainText('+ const oldVal = 1;');

    // 最下部掲示板では過去分も含めて「介入1：...」「介入2：...」が並んで表示されること
    await expect(page.getByText('介入1：過去のリファクタリング提案', { exact: true })).toBeVisible();
    await expect(page.getByText('介入2：型アノテーションの追加', { exact: true })).toBeVisible();

    // 2. 2番目の提案（介入2）をクリックするとトグルが開き、before / after / 採用・却下・詳細 が表示されること
    await page.getByTestId('proposal-toggle-prop-e2e-2').click();
    await expect(page.getByTestId('proposal-before-prop-e2e-2')).toContainText('- function greet(name) { return name; }');
    await expect(page.getByTestId('proposal-after-prop-e2e-2')).toContainText('+ function greet(name: string): string { return name; }');
    await expect(page.getByTestId('proposal-apply-prop-e2e-2')).toBeVisible();
    await expect(page.getByTestId('proposal-reject-prop-e2e-2')).toBeVisible();
    const detailBtn2 = page.getByTestId('proposal-detail-prop-e2e-2');
    await expect(detailBtn2).toBeVisible();

    // 3. 2番目の「詳細」ボタンをクリックして対話ビューへ遷移（1番目ではなく2番目が開くこと！）
    await detailBtn2.click();

    // 対話ビューで2番目の提案内容が表示されること
    await expect(page.getByRole('button', { name: '⬅️ 一覧・簡易設定に戻る' })).toBeVisible();
    await expect(page.getByText('型アノテーションの追加', { exact: true })).toBeVisible();
    await expect(page.getByText('明示的な型アノテーションを付与することを推奨します')).toBeVisible();
    await expect(page.getByText('📝 変更理由')).toBeVisible();
    await expect(page.getByText('🔍 変更差分')).toBeVisible();
    await expect(page.getByText('💬 AIチャット（質問・相談）')).toBeVisible();
    await expect(page.getByText(/こんにちは！やさしい解説メンターです/)).toBeVisible();

    // 廃止された要素が存在しないこと (Negative Assertions)
    await expect(page.getByText('💡 変更方針の修正')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '⏩ 適用' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '⏪ アンドゥ' })).toHaveCount(0);
    await expect(page.getByTestId('diff-accept-btn')).toHaveCount(0);
    await expect(page.getByTestId('diff-discard-btn')).toHaveCount(0);

    // 画面遷移前後でサイドバー横幅が一切変化していないこと
    const dialogueContainerBox = await page.locator('.sidebar-container').boundingBox();
    expect(dialogueContainerBox?.width).toBe(initialContainerBox?.width);

    // 4. チャット入力と送信
    const chatInput = page.getByPlaceholder('この変更について質問や相談を入力...');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('どのような型を付けるべきですか？');
    await page.getByRole('button', { name: '送信' }).click();

    // 5. 提案を却下して却下バナーが表示されること
    await page.getByRole('button', { name: '✕ 破棄' }).click();
    await expect(page.getByTestId('dismissed-banner')).toBeVisible();

    // VS Code へ SEND_CHAT_MESSAGE と DISCARD_INTERVENTION が prop-e2e-2 に対して送信されたことを検証
    const messages = await page.evaluate(() => (window as unknown as MockWindow).__messagesToVsCode);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SEND_CHAT_MESSAGE',
          payload: expect.objectContaining({
            interventionId: 'prop-e2e-2',
            text: 'どのような型を付けるべきですか？',
          }),
        }),
        expect.objectContaining({
          type: 'DISCARD_INTERVENTION',
          payload: expect.objectContaining({
            interventionId: 'prop-e2e-2',
          }),
        }),
      ])
    );

    // 6. 「⬅️ 一覧・簡易設定に戻る」ボタンをクリック
    await page.getByRole('button', { name: '⬅️ 一覧・簡易設定に戻る' }).click();

    // 初期ビューに戻り、却下した prop-e2e-2 もAI作業コード右端のちっちゃい過去アイコン（✕介入2）に移行していることを検証
    await expect(page.getByText('📋 提案・依頼リスト')).toBeVisible();
    await expect(page.getByTestId('workspace-past-icon-prop-e2e-2')).toContainText('✕介入2');
    await expect(page.getByText('✕ 破棄済').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '⬅️ 一覧・簡易設定に戻る' })).toHaveCount(0);

    // ブラウザコンソールエラーが0件であること
    expect(consoleErrors).toEqual([]);
  });
});

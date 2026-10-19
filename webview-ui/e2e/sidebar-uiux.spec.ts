/**
 * [Why/Intent] VS Code API と疎結合なサイドバー Webview UI/UX 専用の Playwright E2E テストスイート。
 * VS Code 本体（Electron）を起動することなく、Web 開発サーバー（Vite）と Playwright のモック注入を活用し、
 * 高速かつ安定して全タブの画面遷移、UI 4 状態（Empty, Loading, Error, Content）、設定フォームの操作、
 * および双方向メッセージング（IPC）を実機ブラウザ（Chromium）上で検証する。
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

  test('全タブのナビゲーション切り替えと対応パネルの描画検証', async ({ page }) => {
    // 1. 初期状態: [💻 Code] タブがアクティブ
    await expect(page.getByText('Waiting for document sync...')).toBeVisible();

    // 2. [🎓 学習支援] タブをクリック
    await page.getByRole('button', { name: '[🎓 学習支援]' }).click();
    await expect(page.getByRole('heading', { name: '🎯 学習セッションの開始' })).toBeVisible();

    // 3. [📊 Dashboard] タブをクリック
    await page.getByRole('button', { name: '[📊 Dashboard]' }).click();
    await expect(page.getByRole('button', { name: 'Response' })).toBeVisible();

    // 4. [⚙️ Settings] タブをクリック
    await page.getByRole('button', { name: '[⚙️ Settings]' }).click();
    await expect(page.getByRole('button', { name: '🔧 全般・自動推敲' })).toBeVisible();

    // 5. [🐞 AI推論デバッグ] タブをクリック
    await page.getByRole('button', { name: '[🐞 AI推論デバッグ]' }).click();
    await expect(page.getByText('🐞 AI推論デバッグインスペクタ')).toBeVisible();
  });

  test('学習支援タブにおける UI 4 状態（Empty, Loading, Error, Content）の網羅検証', async ({ page }) => {
    // 学習支援タブへ切り替え
    await page.getByRole('button', { name: '[🎓 学習支援]' }).click();

    // --- State A: Empty 状態（初期表示） ---
    await expect(page.getByRole('heading', { name: '🎯 学習セッションの開始' })).toBeVisible();
    await expect(page.getByRole('button', { name: '🚀 見守り学習を開始する' })).toBeVisible();

    // --- State B: Loading 状態 ---
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'SYNC_SESSION_STATE',
          payload: {
            status: 'loading',
            taskId: 'task-test-1',
            taskDescription: 'TypeScript演習',
            learningGoal: '型安全性の理解',
            disclosureMode: 'stepByStep',
            unlockedLevel: 1,
            latestPrediction: null,
            assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
            snoozeUntilTimestamp: null,
            isDismissed: false,
            lastUpdatedTimestamp: Date.now(),
            history: []
          }
        }
      }));
    });
    await expect(page.getByText('⏳ AIがあなたのコードから完成形の予想図を準備しています...')).toBeVisible();

    // --- State C: Error 状態 ---
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'SYNC_SESSION_STATE',
          payload: {
            status: 'error',
            taskId: 'task-test-1',
            taskDescription: 'TypeScript演習',
            learningGoal: '型安全性の理解',
            disclosureMode: 'stepByStep',
            unlockedLevel: 1,
            latestPrediction: null,
            assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
            snoozeUntilTimestamp: null,
            isDismissed: false,
            lastUpdatedTimestamp: Date.now(),
            history: [],
            errorMessage: 'セッション情報の同期に失敗しました'
          }
        }
      }));
    });
    await expect(page.getByText('⚠️ AI見守りサービス エラー')).toBeVisible();
    await expect(page.getByText('セッション情報の同期に失敗しました')).toBeVisible();
    await expect(page.getByRole('button', { name: '🔄 再試行' })).toBeVisible();

    // --- State D: Content 状態（正常アクティブセッション） ---
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'SYNC_SESSION_STATE',
          payload: {
            status: 'success',
            taskId: 'task-test-1',
            taskDescription: 'TypeScript基礎演習',
            learningGoal: '関数の型定義',
            disclosureMode: 'stepByStep',
            unlockedLevel: 1,
            latestPrediction: {
              predictedGoal: '関数の型定義',
              scaffoldingLevels: {
                level1Perspective: '引数の型定義を見直してみましょう',
                level2Concept: '',
                level3SkeletonCode: '',
                level4CompleteDiff: ''
              },
              milestones: [],
              estimatedProgress: 30
            },
            assessment: {
              isStagnated: true,
              consecutiveStagnantCount: 3,
              reason: 'NO_PROGRESS_SCORE',
              confidence: 1.0
            },
            snoozeUntilTimestamp: null,
            isDismissed: false,
            lastUpdatedTimestamp: Date.now(),
            history: []
          }
        }
      }));
    });
    await expect(page.locator('[data-testid="learning-scaffolding-panel"]')).toBeVisible();
    await expect(page.getByText('🎯 課題: TypeScript基礎演習')).toBeVisible();
    await expect(page.getByText('引数の型定義を見直してみましょう')).toBeVisible();
    await expect(page.getByText('💡 少し手が止まっているようです。ヒントを活用してみませんか？')).toBeVisible();
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

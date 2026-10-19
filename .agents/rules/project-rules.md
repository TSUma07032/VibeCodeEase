# vibeCodeEase Project-Specific Rules

本ファイルは、`vibeCodeEase` プロジェクトに特有の設計方針、アーキテクチャ制約、および運用ルールを定義します。

---

## 1. エディタ同期と循環介入防止 (Side-by-Side Editor Protection)
- **フラグ保護の必須化**:
  `SideEditorProvider` において介入適用（`handleApplyIntervention`）を実行する際は、ドキュメント変更イベントによる再同期ループや競合状態を防ぐため、必ず `this._isApplyingIntervention = true` による排他フラグ保護を行い、`finally` 節で解除すること。
- **左エディタ介入の完全排除**:
  本拡張機能は Side-by-Side 構成（右側の Webview SideEditor への集約）を設計方針とするため、左エディタへの直接的な CodeAction やインラインデコレーションの追加は行わない。

## 2. ビルド成果物とテスト環境 (Build & Test Hygiene)
- **TypeScript ビルド出力のクリーンアップ**:
  `tsc -p . --outDir out` は削除されたソースファイルを自動消去しないため、テストスイートの構成変更やファイル移動を行った後は、必ず `out/` ディレクトリをクリーンアップしてからテストを実行すること。
- **UIテストと拡張機能テストの分離**:
  - Webview UI: `npm run test:ui` (Vitest)
  - VS Code Extension: `npm test` (vscode-test Mocha)

## 3. LLM設定とセキュアストレージ (Security & LLM Configuration)
- **APIキーの保存先**:
  Gemini API キーはプレーンテキストの設定ファイルではなく、VS Code の `context.secrets` (SecretStorage) を最優先で利用すること。
- **同期間隔のクランプ**:
  LLMのバックグラウンド自動解析間隔は、APIレート制限保護およびトークン消費抑制のため、5秒〜3600秒（1時間）の範囲に必ずクランプすること。

## 4. 学習支援と自動推敲の協調一時停止制御 (Service Coordination & Rate Limit Protection)
- **APIレートリミット保護のための協調一時停止**:
  学習支援セッション（Learning Session）稼働中は、既存の自動推敲（LlmBackgroundService）が並行稼働してGemini APIのレートリミット（15RPM等）を消費することを防ぐため、`pauseExistingAnalysisDuringLearning` 設定に基づいて `LlmBackgroundService.pause()` / `resume()` を一元ディスパッチすること。
- **手動実行の不可侵**:
  一時停止中であっても、ユーザーによる明示的な手動推敲実行（`onForceAnalyze`）はブロックせず即時実行を許可すること。

## 5. 実LLM連携テストの必須化 (Live LLM Integration Testing)
- **実通信疎通テストの義務**:
  LLMクライアント（`GeminiClient`）、プロンプト生成ロジック、およびレスポンスJSONスキーマを改修・追加する際は、モックテストだけで済ませず、環境変数 `TEST_GEMINI_API_KEY` を設定の上、`npm run test:llm` を実行して実Gemini APIとの疎通・スキーマ整合テストをパスすること。
- **認証情報コミットの絶対禁止 (CWE-798)**:
  使い捨て・テスト用であっても、APIキーをソースコードやリポジトリ内に直接平文ハードコードしてはならない。必ず環境変数経由で注入すること。
- **Embeddingモデルとレスポンススキーマの整合性**:
  Gemini API (v1beta) の Embedding モデル名は `gemini-embedding-001` を使用し、推敲プランの修正前テキストスキーマキーは `oldText` を使用すること。

## 6. サイドバーUI/UXブラウザ連携テスト (Playwright Standalone E2E)
- **VS Code API 疎結合ブラウザテストの必須運用**:
  Webviewサイドバーの画面遷移、UI 4状態（Empty, Loading, Error, Content）、設定フォーム、および双方向IPCメッセージの検証は、VS Code本体を起動せず、Playwrightの `page.addInitScript` による `acquireVsCodeApi` モック注入を活用した `npm run test:e2e`（`sidebar-uiux.spec.ts`）で自動検証すること。


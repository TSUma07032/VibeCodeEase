# vibeCodeEase Project-Specific Rules

本ファイルは、`vibeCodeEase` プロジェクトに特有の設計方針、アーキテクチャ制約、および運用ルールを定義します。

---

## 1. エディタ同期と循環介入防止 (Side-by-Side Editor Protection)
- **フラグ保護の必須化**:
  `SideEditorProvider` において介入適用（`handleApplyIntervention`）を実行する際は、ドキュメント変更イベントによる再同期ループや競合状態を防ぐため、必ず `this._isApplyingIntervention = true` による排他フラグ保護を行い、`finally` 節で解除すること。
- **左エディタ介入の適正化（非侵襲オンデマンド方式）**:
  ユーザーのコーディングを妨害する無断コード書き換えや侵襲的UIは排除する。ただし、非侵襲な薄いヒートマップ装飾および控えめなアイコンによるオンデマンド示唆（`InlineInterventionDecorator`）は許可する。詳細展開（Diff/Chat）は要求時のみ右側Webviewで行う。
- **ドキュメント編集時の範囲オフセット補正とゴースト防止**:
  エディタ装飾や行範囲（Range）を内部保持するサービスは、ユーザー編集イベント（onDidChangeTextDocument）の contentChanges に応じて行オフセットを自動補正すること。介入対象行が完全に削除された場合は自動的に dismissed へ遷移させ、ゴースト装飾の残留を防止すること。

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
- **統一ゲートウェイ（ILlmGateway）経由の通信徹底とアーキテクチャ境界テスト**:
  サービスクラスから直接低レベル通信クライアント（`GeminiClient`, `VscodeLmClient`, `fetch`, `node:https` 等）を直接インスタンス化・呼び出しすることを禁止し、必ず `ILlmGateway` をDI注入すること。境界防御テスト `llmArchitectureBoundary.test.ts` を常時パスすること。
- **生レスポンスの無欠損ログ出力とロガーDI**:
  可観測性向上のため、LLMからの生の返答文字列（`rawResponseText`）は1文字も欠落させず丸ごとコンソール出力（`console.info`）すること。テスト容易性のため、ロガー関数はOptionsパターンでDI注入可能とすること。

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
- **型安全な MockWindow の定義必須化**:
  `page.addInitScript` や `page.evaluate` 内で `window` オブジェクトを拡張・参照する際、`(window as any)` による型の揉み消しを禁止する。必ず `interface MockWindow` を定義し、`window as unknown as MockWindow` で型安全にキャストすること。
- **UI仕様変更時におけるE2Eテストのアトミック同期**:
  コンポーネントや画面の仕様変更・要素刷新（インライン差分化、ボタン文言変更等）を行う際は、単体テスト（Vitest）のみならずPlaywright E2Eテストのセレクタ・検証ロジックを同時に改修し、旧UIセレクタ依存によるタイムアウトを防ぐこと。


## 7. Windows環境におけるテスト実行とファイル整合性 (Windows Test Hygiene & File Integrity)
- **VS Codeバックグラウンド更新Mutex競合の検知と復帰**:
  Windows環境において `vscode-test`（`npm test`）を実行する際、VS Codeのバックグラウンド自動更新（Inno Setup）によって `CodeSetup-stable-*.tmp` プロセスが起動し、Mutex `vscode-updating` がロックされてテストが30秒タイムアウトで失敗することがある。この場合、PowerShellで `*CodeSetup*` プロセスを検知・安全に停止（`Stop-Process -Name "*CodeSetup*" -Force`）してMutexを解放した上でテストを再実行すること。
- **PowerShellテキストリダイレクトによる文字化け防止**:
  Windows PowerShell 5.1 の `Set-Content` やリダイレクト演算子（`>`）は既定で UTF-16 / Shift-JIS となり、UTF-8 ソースコードに文字化け（Mojibake）やBOM混入を引き起こす。ファイル作成・編集には常に安全なファイル編集ツール（`write_file` / `edit_file`）を用い、シェルによる直接のテキスト出力を禁止すること。

## 8. リソースライフサイクルとテスト形骸化防止 (Resource Lifecycle & Test Verification Integrity)
- **`dispose()` テストにおけるスパイ検証の必須化**:
  `StatusBarItem` やイベントリスナー等のリソース解放（`dispose()`）をテストする際、`assert.doesNotThrow(() => target.dispose())` のような単なる例外非発生アサーションは、内部の解放処理が実際に呼ばれていなくてもパスしてしまう（テスト形骸化・偽陽性）。必ずスパイ関数（ラップ関数等）を配備し、内部の子要素・リスナーの `dispose()` が確実に実行されたことを明示的にアサートすること。
- **オンデマンドUIと設定画面の表示競合調停**:
  Webview側でオンデマンド2カラム詳細表示（`onDemandDetail`）中に設定画面オープン指示（`NAVIGATE_TO_SETTINGS`）を受信した際は、表示の競合やレイアウト崩れを防ぐため、必ず `setOnDemandDetail(null)` により詳細選択を安全に解除した上で設定タブへ遷移すること。

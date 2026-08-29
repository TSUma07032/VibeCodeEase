# 開発ロードマップ & タスク状況

## 🧱 1. 基盤・ひな形作成
- [x] Jules用型定義の作成 (`src/types/index.ts`)
  - 説明: PainCategory, InterventionLevel, UserPreferenceProfile, AnalysisResult 等のシステム全体で使う型定義。
  - Jules Memo: `src/types/` 配下の複数のファイルに型定義を分割し、`index.ts` から一括エクスポート。プリセット型 `PresetMode` / `PRESET_DEFINITIONS` を追加。
- [x] サイドバー設定画面 (Webview View) の基盤構築
  - 説明: ユーザーがPainマトリクスを設定するためのReact製サイドバーの通信基盤。
  - Jules Memo: vscode.WebviewViewProviderを実装し、ViteでビルドしたReactアプリ(dist/assets)を読み込む形で疎通確認完了。
  - [x] (修正) Viteビルド後のアセット読み込み時に404エラーになる問題を修正。
- [x] エディタリアルタイム支援 (Hover / QuickFix) の基盤構築
  - 説明: 特定のキーワードに対してVS CodeのネイティブUIを出す基盤。
  - Jules Memo: vscode.HoverProviderとCodeActionProviderを`*`で登録し、介入判定エンジンおよび学習ヒント（Learning Hint）を連動。
- [x] VS Code ステータスバー（画面下部）への動作モード表示基盤
  - 説明: 現在の介入モード（学習 / フロー / 職人 / カスタム）を非侵入型でリアルタイム表示するUI基盤。
  - Jules Memo: `VibeStatusBar`クラスを実装し、GlobalStateの変更イベント（`onDidChangeState`）とリアルタイムに同期。

## ⚙️ 2. コアロジック
- [x] タイポ・構文エラーの検出ロジック (`src/core/analyzer.ts`)
  - 説明: 入力された不完全なコードからエラーの種類（PAIN 1: 構文・タイポ等）と箇所を特定する。
- [x] 介入判定エンジン (サイレント修正 vs ポップアップ提案 vs スキップ) (`src/core/interventionEngine.ts`)
  - 説明: ユーザー設定（1次元ベクトル）とエラー内容に基づき、介入レベル（自動サイレント修正 / サジェストパネル提案 / スキップ）を動的に決定する。
  - Jules Memo: `InterventionEngine`クラスを実装。0.75以上をSILENT、0.40以上をSUGGESTION、0.40未満をIGNORE（自力解決）と判定。学習モード向けの教育的ヒント生成機能も実装。
  - [x] PainCategoryごとの嗜好値から介入レベルを決定する純粋関数を実装。
  - [x] `SILENT` / `SUGGESTION` / `IGNORE` の境界値と判定ロジックを定義。
  - [x] 判定結果を `HoverProvider` と `CodeActionProvider` が参照する仕組みを追加。
- [x] 言語不問のリアルタイム診断検知 (`src/core/diagnosticsService.ts`)
  - 説明: 各言語サーバーが発行するVS Code Diagnostics（赤波線）を監視し、言語不問でPainCategoryへマッピング。
- [x] 保存時サイレント自動修正 (`src/core/silentFixService.ts`)
  - 説明: `workspace.onWillSaveTextDocument` にフックし、`SILENT` 判定された安全な修正を保存時にバックグラウンドで自動適用。
- [x] LLM API連携による動的介入・解説生成 (`src/core/llmInterventionService.ts`):
  - 説明: 静的なルールベースに加え、ユーザーの状況や文脈に応じた解説や修正案をLLM経由で動的に生成する機能。
  - [x] APIキー等の機密情報をVS CodeのSecretStorageで管理。
  - [x] LLM連携層のモジュール化・責務分離（PromptBuilder, PlanValidator, GeminiClient, VscodeLmClient）。
  - [x] LLM応答のスキーマ検証、oldText探索・改行オフセット変換、無効な修正案の拒否処理。

## 🎨 3. フロントエンド UI (React) & インタラクション
- [x] プリセット＆Painマトリクス設定画面のUI実装 (`webview-ui/src/App.tsx`)
  - 説明: プリセット（学習モード / フローモード / 職人モード / カスタム）のカード選択UIと、各Painカテゴリごとのスライダー入力UI。
  - Jules Memo: VS CodeネイティブのCSS変数に調和したモダンUIを実装。リアルタイムバッジ（自動修正 / 提案 / 自力解決）を表示。
- [x] 拡張機能本体とのメッセージ双方向同期処理
  - 説明: UIで変更したプリセットや設定値をNode.js側に送信し、`GlobalState` にリアルタイム反映。
  - Jules Memo: `GET_SETTINGS`, `SET_PRESET`, `UPDATE_PREFERENCE_VALUE` を実装し、初期化時および変更時の完全同期を確立。
- [x] 学習・コード理解サポートUI
  - 説明: LLM解析プランのプレビュー画面に、学習モードに応じた「🎓 学習ポイント」や変更理由を分かりやすく提示。

## 🔬 4. 研究・実験・自動適応基盤 (Adaptive & Research)
- [x] 行動ログ収集基盤 (`src/core/actionLogService.ts`)
  - 説明: 承認（APPLY）、却下（REJECT）、モード変更、保存時自動修正をCSV（`research_action_log.csv`）に追記記録。
- [x] 適応型サジェストエンジン (`src/core/adaptiveEngine.ts`)
  - 説明: ユーザーの連続承認パターンを検知し、「次回から自動修正（SILENT）にしますか？」とプロアクティブに提案・設定反映。

## 🧪 5. テスト & 品質
- [x] ユニットテストの完全網羅（全31件合格）
  - `types.test.ts`: カテゴリ解析、クランプ関数
  - `promptBuilder.test.ts`: JSON Schema & プロンプト生成
  - `planValidator.test.ts`: CRLF/LFオフセット解決、プラン検証
  - `analyzer.test.ts`: タイポ検出ロジック
  - `interventionEngine.test.ts`: 介入レベル判定、境界値、学習ヒント
  - `adaptiveEngine.test.ts`: 連続承認カウント、カテゴリ別適応判定
  - `extension.test.ts`: 拡張機能ロードテスト

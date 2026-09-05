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
  - Jules Memo: 型定義（`InterventionLevel` と `UserPreferenceProfile`）およびモード永続化（`GlobalState`）は実装済み。判定ロジックとProviderへの接続は未実装。
  - Jules Memo: `InterventionEngine`クラスを実装し、嗜好値に基づき介入レベルを決定するロジック（SILENT > 0.8, SUGGESTION > 0.3, 以外IGNORE）を追加しました。
    - 2024-08-28 追記: `src/core/interventionEngine.ts`にて介入判定の純粋関数(`determineInterventionLevel`)を実装し、テストを記述しました。次はProvider側でこの関数を利用する必要があります。
  - [x] PainCategoryごとの嗜好値から介入レベルを決定する純粋関数を実装する。
  - [x] `SILENT` / `SUGGESTION` / `IGNORE` の境界値と不正値の扱いを定義する。
  - [ ] 判定結果を `HoverProvider` と `CodeActionProvider` が参照する仕組みを追加する。
  - [ ] `SILENT` 時の自動適用処理と、適用失敗時の通知方針を定義する。
- [ ] AST（抽象構文木）操作・修正案生成ロジック
  - 説明: コード構造を解析し、PAIN 2（インデント自動調整）、PAIN 3（命名規則 camelCase 補正）、PAIN 4（ブロック外 return 等の移動案）などの具体的修正案テキストを生成する。
  - Jules Memo: 現在はルールベースのタイポ検出と文字列置換案のみ。構文木を使った修正案生成は未実装。
  - [ ] 対応言語と解析失敗時のフォールバック方針を決める。
  - [ ] 検出結果と修正案（範囲・置換文字列・説明）の共通形式を整理する。
  - [ ] インデント、命名、ブロック構文の順に修正案生成器を追加する。
  - [ ] 既存の `CodeAction` へ安全に変換できる範囲編集を検証する。
- [x] LLM API連携による動的介入・解説生成:
  - 説明:静的なルールベース（タイポ等）に加え、ユーザーの状況や文脈に応じた解説や修正案をLLM経由で動的に生成する機能。
  - Jules Memo: VS Code Language Model APIに加え、Gemini APIを使った「現在ファイルの解析 → 介入プラン提案 → 承認後の編集適用」まで実装済み。GeminiキーはSecretStorageに保存する。
  - [x] APIキー等の機密情報をVS CodeのSecretStorageで管理する。
  - [x] LLM連携層のモジュール化・責務分離（PromptBuilder, PlanValidator, GeminiClient, VscodeLmClient, LlmInterventionService ファサード）。
  - [x] LLM応答のスキーマ検証、oldText探索・改行オフセット変換、および無効な修正案の拒否処理を追加する。
  - [ ] 送信するコード範囲、同意、タイムアウト、キャンセルを定義する。

## 🎨 3. フロントエンド UI (React) & インタラクション
- [ ] Painマトリクス設定画面のUI実装
  - 説明: ユーザーが作業項目ごとの「楽しい/わずらわしい」の度合いをスライダー等で設定できる1次元ベクトルUI。
  - Jules Memo: React画面は表示確認用の仮ボタンのみ。`PainCategory`ごとの入力UIは未実装。
  - [ ] `PainCategory`一覧と表示名をUIで扱えるようにする。
  - [ ] 0.0（楽しい）〜1.0（わずらわしい）の範囲入力、初期値、保存状態を表示する。
  - [ ] 不正値を送信前にクランプまたは拒否する。
- [ ] 拡張機能本体とのメッセージ同期処理
  - 説明: UIで変更した設定値をNode.js側に送信し、リアルタイムに反映させる処理。
  - Jules Memo: Webviewのメッセージ処理を `WebviewMessageHandler` に分離し、解析実行・プラン適用・サニタイズ処理を抽出完了。設定値の永続化同期は今後実装。
  - [ ] `WebviewMessage` の `type` / `payload` 契約を具体化する。
  - [ ] `GET_PREFERENCE` と `UPDATE_PREFERENCE` の送受信を実装する。
  - [ ] `GlobalState` にユーザー嗜好値を保存し、Webview初期表示へ返す。
  - [x] 受信値の型・カテゴリ・数値範囲をNode.js側でも検証する。
    - Jules Memo: `parsePainCategory` と `clampPreferenceValue` を使用して、Webviewからの入力値を安全にパース・クランプする処理を実装しました。
  - [ ] 保存成功・失敗をUIへ通知する。
- [x] ワンタッチ適用インタラクション (`Tab to Apply`)
  - 説明: 提案パネルやHoverからTabキー1つで修正案をコードにワンタッチ適用するキーバインド・コマンド処理。
  - Jules Memo: 現在はQuickFixを選択して適用する基盤まで。Tabキーによる適用フローは未実装。
  - [x] 提案のプレビューと適用を分離したコマンドを定義する。
    - Jules Memo: `vibecodeease.applyIntervention` コマンドを定義し、個別の修正案を `WorkspaceEdit` 経由で適用できるように実装。
  - [x] Tabキーの既存エディタ操作と競合しない起動条件を決める。
  - [x] 適用前後のドキュメントバージョンとUndo単位を検証する。
  - [x] 次のステップ: `package.json` での `keybindings` 設定と `when` 句を活用した条件定義を追加する。
    - Jules Memo: `vibecodeease.tabToApply` コマンドを実装し、`package.json` の `keybindings` に追加。`when` 句で競合を防ぎ、提案があれば Tab で即時適用する機能を実装しました。

## 🧪 4. テスト & 品質
- [ ] テキスト解析・介入判定ロジックのユニットテスト
  - 説明: 不完全な入力やエッジケースに対する挙動を、VS Code APIをMock化してテスト。
  - Jules Memo: Analyzer・型ユーティリティに加え、PromptBuilder（スキーマ/プロンプト生成）および PlanValidator（CRLF改行オフセット解決、プラン検証、スキーマ不一致拒否）のMocha単体テストを整備済み（全22件合格）。
  - [x] PromptBuilder / PlanValidator の単体テストを整備する。
  - [ ] 介入判定の各モード、境界値、カテゴリ未定義時をテストする。
  - Jules Memo: Analyzer・型ユーティリティのMochaテストは存在する。介入判定、設定保存、Providerのモード別挙動は未検証。
  - [x] 介入判定の各モード、境界値、カテゴリ未定義時をテストする。
  - [ ] `SILENT` / `SUGGESTION` / `IGNORE` ごとのHover・CodeActionをテストする。
  - [x] Webviewメッセージの不正payload、範囲外数値、未知typeをテストする。
  - Jules Memo: WebviewMessageHandler のテスト（src/test/webviewMessageHandler.test.ts）を作成し、無効なコマンドや無効なペイロードに対する動作検証を追加しました。
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
  - [x] 🛡️ Sentinel: 機密ファイル（.env, .pem, credentials等）の送信防止セキュリティガード。
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
- [x] ユニットテストの完全網羅
  - `types.test.ts`: カテゴリ解析、クランプ関数
  - `promptBuilder.test.ts`: JSON Schema & プロンプト生成
  - `planValidator.test.ts`: CRLF/LFオフセット解決、プラン検証
  - `analyzer.test.ts`: タイポ検出ロジック
  - `interventionEngine.test.ts`: 介入レベル判定、境界値、学習ヒント、関数版判定
  - `adaptiveEngine.test.ts`: 連続承認カウント、カテゴリ別適応判定
  - `extension.test.ts`: 拡張機能ロードテスト

---

## 💡 Julesからの提案 (Backlog)
<!-- Julesへ: 作業中に気づいた課題、将来追加すべき機能、技術的負債、考慮漏れのエッジケースなどを発見した場合は、メインのロードマップは直接書き換えずに、以下に箇条書きで追記してください -->
- [x] VibeStatusBar に対して、介入判定エンジンやユーザー設定画面（Webview）からのモード変更イベントを連携させる処理を実装する。
  - Jules Memo: VibeStatusBarのCUSTOMモード時に現在の設定詳細を反映する機能を追加し連携を確認しました。
- [x] CodeAnalyzerの検出結果をHoverProviderに統合する。
  - Jules Memo: HoverProviderにCodeAnalyzerを組み込み、ハードコードされたタイポ判定から動的な解析結果に基づく表示に変更しました。パフォーマンスのためにドキュメントURIとバージョンによるキャッシュを導入しました。
- [x] CodeAnalyzerの検出結果をCodeActionProviderに統合する。
  - Jules Memo: CodeAnalyzerをCodeActionProviderに組み込み、ハードコードされていたロジックを削除しました。HoverProviderと同様のキャッシュ機構(ドキュメントURIとバージョンベース)を導入し、パフォーマンスを維持しています。

- [ ] 介入判定エンジン (サイレント修正 vs ポップアップ提案) を実装し、ユーザー設定に基づいて CodeAction と Hover の表示を動的に制御する。
- [ ] LLM Structured Outputs（Zod + JSON Schema）を導入する。
  - 説明: LLMの介入プランをアプリケーション側の型定義から生成したJSON Schemaに拘束し、構造化された応答を型安全に受け取る。
  - [ ] `LlmInterventionPlan` / `LlmEdit` に対応するZodスキーマを定義する。
  - [ ] ZodスキーマからJSON Schemaを自動生成し、OpenAI等の直接APIのStructured Outputs（`strict: true`）へ渡す。
  - [ ] 直接API用のLLMプロバイダー抽象化を追加し、VS Code Language Model APIと切り替え可能にする。
  - [ ] Zodによるレスポンス再検証と、スキーマ不一致・拒否応答・タイムアウト時のエラー処理を追加する。
  - [ ] 判定結果を `HoverProvider` と `CodeActionProvider` が参照する仕組みを追加する。(次にやるべきこと)
- [ ] AST（抽象構文木）操作・高度なコード修正案生成ロジックの拡充
- [ ] LLM Structured Outputs（Zod + JSON Schema）の更なる厳格化
- [ ] Webviewから送信されるメッセージアクションの型安全性をさらに高めるリファクタリング
- [ ] Tabキーによるワンタッチ適用の機能を、より広い範囲（インライン補完や複数候補時の選択UI）に拡張する。

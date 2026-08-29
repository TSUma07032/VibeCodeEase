# 開発ロードマップ & タスク状況

## 🧱 1. 基盤・ひな形作成
- [x] Jules用型定義の作成 (`src/types/index.ts`)
  - 説明: PainCategory, InterventionLevel, UserPreferenceProfile, AnalysisResult 等のシステム全体で使う型定義。
  - Jules Memo: `src/types/` 配下の複数のファイルに型定義を分割し、`index.ts` から一括エクスポートすることで保守性を向上させました。`vscode` パッケージの型に依存せず独立した型定義としたため、将来的な再利用性が高まっています。また、不正な値からの復帰をサポートするユーティリティ（クランプ関数等）を追加し、Mochaでテストを記述しました。
- [x] サイドバー設定画面 (Webview View) の基盤構築
  - 説明: ユーザーがPainマトリクスを設定するためのReact製サイドバーの通信基盤。
  - Jules Memo: vscode.WebviewViewProviderを実装し、ViteでビルドしたReactアプリ(dist/assets)を読み込む形で疎通確認完了
  - [x] (修正) Viteビルド後のアセット読み込み時に404エラーになる問題を修正（HTMLの `<base href>` タグ追加、Webview用URI変換、CSP/Nonce追加による相対パス解決の正常化）。
- [x] エディタリアルタイム支援 (Hover / QuickFix) の基盤構築
  - 説明: 特定のキーワードに対してVS CodeのネイティブUIを出す基盤。
  - Jules Memo: vscode.HoverProviderとCodeActionProviderを`*`で登録し、functon等のTypo置換を行う基盤を作成完了
- [x] VS Code ステータスバー（画面下部）への動作モード表示基盤
  - 説明: 現在の介入モード（例: `Assist: Silent`, `Assist: Suggestions Panel` 等）を非侵入型でリアルタイム表示するUI基盤。
  - Jules Memo: `VibeStatusBar`クラスを実装し、ステータスバーへの非侵入なモード表示を実現しました。次は他の機能からのモード切り替えの連動を実装する必要があります。

## ⚙️ 2. コアロジック (Jules担当)
- [x] タイポ・構文エラーの検出ロジック (`src/core/analyzer.ts`)
  - 説明: 入力された不完全なコードからエラーの種類（PAIN 1: 構文・タイポ、PAIN 4: ブロック構文エラー等）と箇所を特定する。
  - Jules Memo: CodeAnalyzerを作成し、`functon`や`if condtion:`のタイポを検出してAnalysisResultの形式で返す基盤を実装しました。

- [ ] 介入判定エンジン (サイレント修正 vs ポップアップ提案)
  - 説明: ユーザー設定（1次元ベクトル）とエラー内容に基づき、介入レベル（自動サイレント修正 / サジェストパネル提案 / スキップ）を動的に決定する。
  - Jules Memo: 型定義（`InterventionLevel` と `UserPreferenceProfile`）およびモード永続化（`GlobalState`）は実装済み。判定ロジックとProviderへの接続は未実装。
  - [ ] PainCategoryごとの嗜好値から介入レベルを決定する純粋関数を実装する。
  - [ ] `SILENT` / `SUGGESTION` / `IGNORE` の境界値と不正値の扱いを定義する。
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
  - [ ] 受信値の型・カテゴリ・数値範囲をNode.js側でも検証する。
  - [ ] 保存成功・失敗をUIへ通知する。
- [ ] ワンタッチ適用インタラクション (`Tab to Apply`)
  - 説明: 提案パネルやHoverからTabキー1つで修正案をコードにワンタッチ適用するキーバインド・コマンド処理。
  - Jules Memo: 現在はQuickFixを選択して適用する基盤まで。Tabキーによる適用フローは未実装。
  - [ ] 提案のプレビューと適用を分離したコマンドを定義する。
  - [ ] Tabキーの既存エディタ操作と競合しない起動条件を決める。
  - [ ] 適用前後のドキュメントバージョンとUndo単位を検証する。

## 🧪 4. テスト & 品質
- [ ] テキスト解析・介入判定ロジックのユニットテスト
  - 説明: 不完全な入力やエッジケースに対する挙動を、VS Code APIをMock化してテスト。
  - Jules Memo: Analyzer・型ユーティリティに加え、PromptBuilder（スキーマ/プロンプト生成）および PlanValidator（CRLF改行オフセット解決、プラン検証、スキーマ不一致拒否）のMocha単体テストを整備済み（全22件合格）。
  - [x] PromptBuilder / PlanValidator の単体テストを整備する。
  - [ ] 介入判定の各モード、境界値、カテゴリ未定義時をテストする。
  - [ ] `SILENT` / `SUGGESTION` / `IGNORE` ごとのHover・CodeActionをテストする。
  - [ ] Webviewメッセージの不正payload、範囲外数値、未知typeをテストする。

---

## 💡 Julesからの提案 (Backlog)
<!-- Julesへ: 作業中に気づいた課題、将来追加すべき機能、技術的負債、考慮漏れのエッジケースなどを発見した場合は、メインのロードマップは直接書き換えずに、以下に箇条書きで追記してください -->
- [ ] VibeStatusBar に対して、介入判定エンジンやユーザー設定画面（Webview）からのモード変更イベントを連携させる処理を実装する。
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
  - [ ] 送信範囲、ユーザー同意、個人情報・秘密情報の除外方針を明文化する。

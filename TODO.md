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
  - Jules Memo: (未着手)
- [ ] AST（抽象構文木）操作・修正案生成ロジック
  - 説明: コード構造を解析し、PAIN 2（インデント自動調整）、PAIN 3（命名規則 camelCase 補正）、PAIN 4（ブロック外 return 等の移動案）などの具体的修正案テキストを生成する。
  - Jules Memo: (未着手)
- [ ] LLM API連携による動的介入・解説生成:
  - 説明:静的なルールベース（タイポ等）に加え、ユーザーの状況や文脈に応じた解説や修正案をLLM経由で動的に生成する機能。
  - Jules Memo: (未着手)

## 🎨 3. フロントエンド UI (React) & インタラクション
- [ ] Painマトリクス設定画面のUI実装
  - 説明: ユーザーが作業項目ごとの「楽しい/わずらわしい」の度合いをスライダー等で設定できる1次元ベクトルUI。
  - Jules Memo: (未着手)
- [ ] 拡張機能本体とのメッセージ同期処理
  - 説明: UIで変更した設定値をNode.js側に送信し、リアルタイムに反映させる処理。
  - Jules Memo: (未着手)
- [ ] ワンタッチ適用インタラクション (`Tab to Apply`)
  - 説明: 提案パネルやHoverからTabキー1つで修正案をコードにワンタッチ適用するキーバインド・コマンド処理。
  - Jules Memo: (未着手)

## 🧪 4. テスト & 品質
- [ ] テキスト解析・介入判定ロジックのユニットテスト (Jest)
  - 説明: 不完全な入力やエッジケースに対する挙動を、VS Code APIをMock化してテスト。
  - Jules Memo: (未着手)

---

## 💡 Julesからの提案 (Backlog)
<!-- Julesへ: 作業中に気づいた課題、将来追加すべき機能、技術的負債、考慮漏れのエッジケースなどを発見した場合は、メインのロードマップは直接書き換えずに、以下に箇条書きで追記してください -->
- [ ] VibeStatusBar に対して、介入判定エンジンやユーザー設定画面（Webview）からのモード変更イベントを連携させる処理を実装する。
- [x] CodeAnalyzerの検出結果をHoverProviderに統合する。
  - Jules Memo: HoverProvider内でCodeAnalyzerを使用するように変更し、ハードコードを排除しました。ドキュメントバージョンに基づくキャッシュも実装しパフォーマンスを確保しました。
- [ ] CodeAnalyzerの検出結果をCodeActionProviderにも統合する。

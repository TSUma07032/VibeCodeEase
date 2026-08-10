# 開発ロードマップ & タスク状況

## 🧱 1. 基盤・ひな形作成
- [ ] Jules用型定義の作成 (`src/types/index.ts`)
  - 説明: PainCategory, InterventionLevel等のシステム全体で使う型定義。
  - Jules Memo: (未着手)
- [x] サイドバー設定画面 (Webview View) の基盤構築
  - 説明: ユーザーがPainマトリクスを設定するためのReact製サイドバーの通信基盤。
  - Jules Memo: vscode.WebviewViewProviderを実装し、ViteでビルドしたReactアプリ(dist/assets)を読み込む形で疎通確認完了
- [x] エディタリアルタイム支援 (Hover / QuickFix) の基盤構築
  - 説明: 特定のキーワードに対してVS CodeのネイティブUIを出す基盤。
  - Jules Memo: vscode.HoverProviderとCodeActionProviderを`*`で登録し、functon等のTypo置換を行う基盤を作成完了

## ⚙️ 2. コアロジック (Jules担当)
- [ ] タイポ・構文エラーの検出ロジック (`src/core/analyzer.ts`)
  - 説明: 入力された不完全なコードからエラーの種類と箇所を特定する。
  - Jules Memo: (未着手)
- [ ] 介入判定エンジン (サイレント修正 vs ポップアップ提案)
  - 説明: ユーザー設定（1次元ベクトル）とエラー内容に基づき、介入レベルを動的に決定する。
  - Jules Memo: (未着手)
- [ ] AST（抽象構文木）操作・修正案生成ロジック
  - 説明: コードの構造を解析し、UIに渡す具体的な修正案テキストを生成する。
  - Jules Memo: (未着手)

## 🎨 3. フロントエンド UI (React)
- [ ] Painマトリクス設定画面のUI実装
  - 説明: ユーザーが「楽しい/わずらわしい」の度合いをスライダー等で設定できるUI。
  - Jules Memo: (未着手)
- [ ] 拡張機能本体とのメッセージ同期処理
  - 説明: UIで変更した設定値をNode.js側に送信し、リアルタイムに反映させる処理。
  - Jules Memo: (未着手)

## 🧪 4. テスト & 品質
- [ ] テキスト解析・介入判定ロジックのユニットテスト (Jest)
  - 説明: 不完全な入力やエッジケースに対する挙動を、VS Code APIをMock化してテスト。
  - Jules Memo: (未着手)

---

## 💡 Julesからの提案 (Backlog)
<!-- Julesへ: 作業中に気づいた課題、将来追加すべき機能、技術的負債、考慮漏れのエッジケースなどを発見した場合は、メインのロードマップは直接書き換えずに、以下に箇条書きで追記してください -->
*

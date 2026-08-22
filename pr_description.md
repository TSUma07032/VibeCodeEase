🎯 消化したTODO:
- [x] CodeAnalyzerの検出結果をHoverProviderに統合する。

💡 実装内容 (What):
- `HoverProvider.ts` および `CodeActionProvider.ts` にハードコードされていたタイポの検出・置換ロジックを削除し、一元化された `CodeAnalyzer` に委譲するようリファクタリングを行いました。
- `HoverProvider` では、ハードコードされた正規表現でのトリガーを廃止し、パフォーマンスに配慮して行単位で解析し、マウスカーソルの位置と検出された問題の `range` を比較して Hover メッセージを表示するように改善しました。
- `CodeActionProvider` も同様に行単位の文字列を `CodeAnalyzer` に渡し、動的に `CodeAction` オブジェクトを構築するように変更しました。

🔗 活用した基盤:
- 先行して実装されていた `CodeAnalyzer` クラス (`src/core/analyzer.ts`)
- 定義済みの `AnalysisResult` 型

📝 次のステップ:
- [ ] CodeAnalyzerに新しいタイポ・構文エラーのルールを追加する（将来の拡張）。

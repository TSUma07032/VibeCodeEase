## 2024-05-18 - タイポ・構文エラーの検出ロジック (src/core/analyzer.ts)
**発見:** 現在 `HoverProvider.ts` 等にタイポの検出ロジック（`functon`, `if condtion:`）がハードコードされています。
**提言:** 今回 `CodeAnalyzer` を作成し、検出ロジックを一元化する基盤を作りました。将来のTODOとして、各Providerをリファクタリングしてこの `CodeAnalyzer` を利用するように変更する必要があります。

## 2024-08-25 - CodeAnalyzerの検出結果をHoverProviderに統合する。
**発見:** `HoverProvider` が頻繁に呼び出されるため、ドキュメントの解析結果をキャッシュしないとパフォーマンスに悪影響が出ることが分かりました。
**提言:** `Map` を使用して `document.uri.toString()` と `document.version` ベースでキャッシュを実装しました。今後の Provider リファクタリング（例：`CodeActionProvider`）でも同様のキャッシュ戦略を検討する必要があります。

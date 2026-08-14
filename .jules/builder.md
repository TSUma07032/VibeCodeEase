## 2024-05-18 - タイポ・構文エラーの検出ロジック (src/core/analyzer.ts)
**発見:** 現在 `HoverProvider.ts` 等にタイポの検出ロジック（`functon`, `if condtion:`）がハードコードされています。
**提言:** 今回 `CodeAnalyzer` を作成し、検出ロジックを一元化する基盤を作りました。将来のTODOとして、各Providerをリファクタリングしてこの `CodeAnalyzer` を利用するように変更する必要があります。

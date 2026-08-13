## 2024-06-11 - Fast Substring Matching on Hot Paths
**Learning:** In VS Code extensions, Providers like `CodeActionProvider` can run very frequently (on every keystroke or cursor movement). Using `String.prototype.match(/.../)` for simple static string searches introduces measurable regex engine overhead compared to simple substring search via `String.prototype.indexOf()`.
**Action:** Always prefer `indexOf` or `includes` over regular expressions for static substring matching, especially in hot paths like Language Providers, to minimize event loop blocking time.
## 2024-08-11 - Early Returns in Code Action Providers
**Learning:** In VS Code extensions, `CodeActionProvider`s execute very frequently, and their logic runs even when the user requests an action kind that the provider does not support (e.g., requesting 'Refactor' when the provider only does 'QuickFix').
**Action:** Always implement an early return check on `context.only.contains(vscode.CodeActionKind.YourKind)` at the beginning of `provideCodeActions` to skip unnecessary text parsing on hot paths.
## 2024-08-12 - Fast array lookups with Set
**学び:** `parsePainCategory` のように、$O(n)$ の Array.includes を使用して頻繁に呼び出される文字列の妥当性検証ロジックがある場合、事前に Set を作成し $O(1)$ の Set.has を使用する方が高速である。
**アクション:** 配列を用いた頻繁な静的文字列の探索においては、事前に Set を構築して参照する方法を優先する。
## 2024-08-13 - Fast Clamping with Math.min and Math.max
**学び:** TypeScript / V8 エンジンにおいて、数値のクランプ（範囲内に収める処理）を行う際、複数の `if` 条件式を用いて比較するよりも、`Math.min` と `Math.max` を組み合わせた組み込み関数を使用する方が大幅に高速である。
**アクション:** 数値を特定の範囲に制限（クランプ）する処理では、条件分岐（`if (val < min) ...`）を避けて、可読性を損なわない `Math.min(Math.max(value, min), max)` パターンを優先的に使用する。

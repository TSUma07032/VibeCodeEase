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
## 2026-08-25 - CodeAnalyzerのタイポ検出処理のパフォーマンス改善
**学び:** 大量の静的文字列探索において、`RegExp.exec` を用いるとイベントループをブロックしパフォーマンスが低下します。また、キーワードを含まない行に対しても正規表現処理を行うのは無駄なコストとなります。
**アクション:** 静的文字列の探索には `String.prototype.indexOf()` を使用し、対象文字列が含まれない場合は早期リターン(`continue`)を行うことで、大量のコード（数万行レベル）の解析時間を大幅に短縮（今回は約270msから約25ms/65msへ改善）するパターンを適用します。
## 2026-08-26 - HoverProviderにおけるループ早期ブレーク最適化
**学び:** ホバーイベントなどで、行番号でソートされた解析結果の配列を走査して包含判定（`contains()`）を行う場合、対象行を過ぎた後も無駄な反復処理やオブジェクト（`vscode.Range`等）の生成を続けるとパフォーマンス低下につながる。
**アクション:** 配列要素が行番号等でソートされている特性を活かし、現在の判定位置を超えた時点で早期にループを抜ける（`break`等）条件ロジックを追加することで、O(N)の処理を平均O(1)に最適化する。
## 2026-08-27 - 意図しないファイルコミットの防止
**学び:** パフォーマンスの計測のために一時的に作成したベンチマークファイルなどをリポジトリ内に残したままコミットすると、プロダクションのコードベースを汚染してしまう。
**アクション:** 実装・検証時に作成した一時ファイルは必ず削除するか、リポジトリ外で実行するよう徹底する。
## 2024-11-20 - Early Breaking on Sequential Distance Searches
**学び:** 文字列の探索（`indexOf`）結果など、順次増加するオフセットの中から目標地点（`hintOffset`）に最も近いものを探す場合、全ての結果を配列に保存して後から探すのは非効率である。距離が減少し、その後増加に転じた時点で最適解が確定するため、そこで早期ブレークが可能。
**アクション:** 順次増加する値からの最短距離探索では、配列のアロケーションを避け、状態（`minDistance`など）を保持した単一パスのループ内で早期ブレーク（`break`）する実装パターンを適用する。

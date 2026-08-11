## 2024-06-11 - Fast Substring Matching on Hot Paths
**Learning:** In VS Code extensions, Providers like `CodeActionProvider` can run very frequently (on every keystroke or cursor movement). Using `String.prototype.match(/.../)` for simple static string searches introduces measurable regex engine overhead compared to simple substring search via `String.prototype.indexOf()`.
**Action:** Always prefer `indexOf` or `includes` over regular expressions for static substring matching, especially in hot paths like Language Providers, to minimize event loop blocking time.
## 2024-08-11 - Early Returns in Code Action Providers
**Learning:** In VS Code extensions, `CodeActionProvider`s execute very frequently, and their logic runs even when the user requests an action kind that the provider does not support (e.g., requesting 'Refactor' when the provider only does 'QuickFix').
**Action:** Always implement an early return check on `context.only.contains(vscode.CodeActionKind.YourKind)` at the beginning of `provideCodeActions` to skip unnecessary text parsing on hot paths.

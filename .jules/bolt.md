## 2024-06-11 - Fast Substring Matching on Hot Paths
**Learning:** In VS Code extensions, Providers like `CodeActionProvider` can run very frequently (on every keystroke or cursor movement). Using `String.prototype.match(/.../)` for simple static string searches introduces measurable regex engine overhead compared to simple substring search via `String.prototype.indexOf()`.
**Action:** Always prefer `indexOf` or `includes` over regular expressions for static substring matching, especially in hot paths like Language Providers, to minimize event loop blocking time.

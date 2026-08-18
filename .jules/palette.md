## 2024-08-10 - Replace preference popup with status bar message
**Learning:** Replaced an intrusive `showInformationMessage` with a subtle `setStatusBarMessage` with a $(check) icon and timeout for non-blocking feedback during preference updates.
**Action:** Always prefer `setStatusBarMessage` with a timeout for background processes and settings updates instead of popups.
## 2026-08-11 - Markdown in Hover tooltips
**Learning:** Replaced plain text string with vscode.MarkdownString to support formatting and theme icons in hover tooltips.
**Action:** Always prefer vscode.MarkdownString over plain text for hover tooltips to improve text clarity, setting supportThemeIcons to true when using standard icons.
## 2024-08-12 - Set isPreferred on obvious QuickFix actions
**Learning:** Adding `isPreferred = true` to a `vscode.CodeAction` allows developers to easily apply obvious fixes using auto-fix shortcuts, reducing friction and enhancing workflow.
**Action:** Always set `isPreferred = true` for clear, non-destructive, and obvious QuickFix actions to improve developer experience.
## 2024-08-13 - Make CodeAction titles specific
**Learning:** Generic QuickFix titles like "Change to 'function'" are ambiguous when there might be multiple typos or contexts on a line. Specific titles like "Change 'functon' to 'function'" provide immediate clarity.
**Action:** Always make CodeAction titles concrete and specific, including the exact variable or text being changed, to improve clarity and developer confidence before applying the fix.
## 2026-08-18 - Improve mode switching UX with QuickPick
**学び:** Replaced a potentially complex setting flow with `vscode.window.showQuickPick` for mode switching. Including standard theme icons (e.g. `$(zap)`) and helpful placeholder text improves clarity. Confirming the selection with a subtle `setStatusBarMessage` avoids intrusive popups and keeps the developer in flow.
**アクション:** Always use `showQuickPick` with theme icons and placeholders for simple list selections, and confirm actions via non-intrusive status bar messages rather than popups.

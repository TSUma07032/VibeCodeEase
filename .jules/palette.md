## 2024-08-10 - Replace preference popup with status bar message
**Learning:** Replaced an intrusive `showInformationMessage` with a subtle `setStatusBarMessage` with a $(check) icon and timeout for non-blocking feedback during preference updates.
**Action:** Always prefer `setStatusBarMessage` with a timeout for background processes and settings updates instead of popups.
## 2026-08-11 - Markdown in Hover tooltips
**Learning:** Replaced plain text string with vscode.MarkdownString to support formatting and theme icons in hover tooltips.
**Action:** Always prefer vscode.MarkdownString over plain text for hover tooltips to improve text clarity, setting supportThemeIcons to true when using standard icons.

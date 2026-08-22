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
## 2024-08-22 - クリック可能なステータスバーとモード切り替え
**学び:** ステータスバーアイテムの `.command` プロパティに登録済みのコマンドIDを設定することで、ユーザーがクリックして直接アクション（例：`showQuickPick` によるモード切り替え）を実行できる。また、`showQuickPick` ではカスタムインターフェースで値を保持し、テーマアイコンを活用することで、直感的で邪魔にならないモード切り替えUXを提供できる。
**アクション:** ステータスバーに表示する情報が切り替え可能な状態やモードである場合、常に `.command` を設定し、`showQuickPick` を使った控えめな切り替えUIを提供する。

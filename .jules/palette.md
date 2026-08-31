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
## 2026-08-25 - Make Status Bar item clickable and integrate mode switching
**学び:** StatusBarItem に `command` を割り当てることで、ステータスバーをクリッカブルなUIとして活用し、関連するアクション（モード切替など）を `showQuickPick` で提供できる。これにより、モード切り替えのための設定画面を開く手間が省け、開発者のフローが改善される。
**アクション:** 拡張機能の現在の状態やモードを示す StatusBarItem には、可能であればその状態を切り替えたり詳細を設定したりするためのコマンドを割り当て、クリッカブルにすることで、より直感的でシームレスなUXを提供する。
## 2026-08-25 - Sync UI with Global State
**学び:** StatusBar などの UI コンポーネントを更新する際、単に表示を更新するだけでは不十分であり、拡張機能の実際の状態（GlobalState など）と同期させないと、ユーザーを誤認させ、機能的に不完全な体験を提供してしまう。
**アクション:** ユーザーインターフェースの状態を変更するアクション（モード切り替えなど）を実装する際は、常に基礎となる状態管理機構（GlobalState、workspace configurationなど）への更新も含め、UIとバックエンドの状態を確実に同期させる。
## 2024-08-27 - Add progress indicator for asynchronous LLM calls
**学び:** 時間のかかる非同期処理（LLM API呼び出しなど）中にUIのフィードバックがないと、ユーザーは処理が動いているのかフリーズしているのか分からず不安になる。`vscode.window.withProgress` と `ProgressLocation.Window` を使うことで、邪魔にならずに進行状況を伝えることができる。
**アクション:** 拡張機能内で実行に時間がかかる（数秒以上）API呼び出しや重い処理を行う際は、常に `vscode.window.withProgress` などの進捗インジケータを実装し、開発者に適切なフィードバックを提供する。
## 2024-08-30 - Replace success popup with status bar message for auto-fix enablement
**学び:** ユーザーが自動修正の設定を有効化するプロンプトに同意した後の完了通知として、ポップアップ (`showInformationMessage`) を表示すると、元の作業フローが不要に中断されてしまう。
**アクション:** このような設定変更の成功通知には、邪魔にならないステータスバーメッセージ (`setStatusBarMessage`) をタイムアウト付きで使用することで、シームレスな体験を提供する。

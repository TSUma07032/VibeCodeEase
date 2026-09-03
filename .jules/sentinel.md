## 2024-08-10 - [Medium] Fix CSP Nonce predictability
**Vulnerability:** The Webview used `Math.random()` to generate the CSP nonce.
**Learning:** `Math.random()` generates pseudo-random numbers which are predictable. If an attacker can predict the sequence, they can guess the nonce and bypass the Content-Security-Policy (CSP), potentially executing arbitrary XSS payloads in the context of the VS Code extension's Webview.
**Prevention:** Always use cryptographically secure random number generators (CSPRNG), such as Node.js's `crypto.randomBytes()`, for security-critical values like nonces, tokens, and passwords.
## 2024-08-11 - [Medium] Fix UI Spoofing via Icon Markdown
**Vulnerability:** The extension took a raw string from Webview messages and displayed it directly via `vscode.window.setStatusBarMessage`. This allowed UI spoofing, as an attacker could inject arbitrary VS Code icons using `$(icon-name)` syntax into the status bar.
**Learning:** The `setStatusBarMessage` API automatically parses and renders octicons from strings. If untrusted string input from a webview is directly passed into it, it becomes an injection vector.
**Prevention:** Sanitize user input before rendering it in UI components that support Markdown or special icon syntax. For `setStatusBarMessage`, strip out `\$\([^)]*\)` patterns.
## 2024-08-12 - [Critical] Prevent Arbitrary Extension File Access in Webviews
**Vulnerability:** The extension set `localResourceRoots: [this._extensionUri]`, which allowed the Webview to request and access any file within the entire extension root directory (including source code, `package.json`, tests, logs, etc.).
**Learning:** `localResourceRoots` defines the directories from which a webview can load local resources (using `vscode-resource:` or `asWebviewUri`). Exposing the entire extension root violates the Principle of Least Privilege and risks data exfiltration if the webview is compromised (e.g., via XSS).
**Prevention:** Always restrict `localResourceRoots` to the most specific directories necessary, such as only the compiled UI assets directory (e.g., `webview-ui/dist`), preventing the webview from accessing arbitrary sensitive files within the extension workspace.
## 2026-08-25 - Fix Permissive Activation Events
**Vulnerability:** `package.json` had `"activationEvents": ["*"]`, forcing the extension to activate immediately upon VS Code startup.
**Learning:** Using `*` blocks the critical startup path of the editor and degrades performance/security. For VS Code versions ^1.125.0, explicit activation for commands and views is no longer needed (implicit activation). However, global language features (Hover, CodeActions) require an event like `onStartupFinished` so they become active after the initial editor startup.
**Prevention:** Avoid `"activationEvents": ["*"]`. Use `"onStartupFinished"` for background tasks or rely on implicit activation for user-triggered features (commands/views).
## 2026-08-25 - [Medium] Prevent DoS via Unvalidated Webview Payloads
**Vulnerability:** The `onDidReceiveMessage` callback assumed that the incoming `data` object was a non-null object with a string `command` property, missing explicit structural validation.
**Learning:** Sending unexpected payload types from a compromised or buggy Webview could cause unhandled exceptions and potentially crash the Extension Host (DoS) if property access on null/undefined is attempted further down the line.
**Prevention:** Implement strict structural payload validation in Webview message handlers (e.g., verifying `typeof data === 'object'`, checking for `null`, and ensuring `typeof data.command === 'string'`) before attempting to process the message.
## 2024-05-24 - [High] Prevent Data Leakage and Prompt Injection
**脆弱性:** 未検証の機密ファイル（.env、.pemなど）がLLMに送信されるリスク、およびLLMプロンプトへのユーザーコード埋め込み時にデリミタが不足しており、プロンプトインジェクションの危険があった。
**学び:** `document.fileName` の検証を怠ると、機密データが外部プロバイダに漏洩する。また、LLMのシステムプロンプトとユーザー入力の間に明確な境界線（デリミタ）がないと、ユーザー入力が指示として解釈される恐れがある。
**予防策:** LLM呼び出し前に `validateDocument` 等を用いてファイルパス・名前を検証し、許可されていないファイルの送信をブロックする。さらに、LLMのプロンプトではユーザー入力部分を ``` などのMarkdownコードフェンスで囲み、システム指示とユーザーデータを明確に分離する。
## 2024-08-25 - [High] Prevent Sensitive File Leakage and Prompt Injection
**脆弱性:** LLMへのプロンプト構築時に、ファイルパス（例: `.env`, `.git`）のチェックが行われておらず、ユーザーの機密ファイルの内容が平文でLLMへ送信されるリスクがありました。また、ユーザーコードがサニタイズされずに直接プロンプトに埋め込まれていたため、ユーザーコード内のバッククォートによってプロンプトインジェクションが発生し、LLMの指示が上書きされる可能性がありました。
**学び:** 拡張機能がエディタ上で任意のファイルにアクセスできる場合、LLMへ送信する内容に機密情報が含まれないよう、ファイルレベルでの事前検証が不可欠です。また、LLMの入力となるテキストは、プロンプト構造を破壊する特殊文字（例: ```）を無害化しなければなりません。
**予防策:** `document.getText()` を呼び出してLLMに送信する前に、`document.fileName` が `.env` 等の機密パターンに一致しないかを検証し、アクセスをブロックします。さらに、コード内容に含まれるバッククォート（```）をエスケープまたは無害化して、プロンプトのデリミタとして認識されないようにします。
## 2024-08-25 - [Critical] Fix Path Traversal in ActionLogService
**脆弱性:** `ActionLogService` の `setWorkspaceRoot` メソッドにおいて、引数 `rootPath` のパス検証が行われていなかったため、パストラバーサルによってワークスペース外のファイルパスが指定され、任意の場所にログファイルが作成・書き込みされる可能性があった。
**学び:** パスを引数として受け取り、それを使用してファイルを書き込む場合（例: `fs.writeFileSync` や `fs.appendFileSync`）、パスが許可されたディレクトリ（この場合はワークスペース）内に制限されているかを厳密に検証しないと、パストラバーサルの脆弱性を引き起こす。
**予防策:** `path.join` などでファイルパスを生成する前に、`rootPath` が `vscode.workspace.workspaceFolders[0].uri.fsPath` で始まっていることを確認する。条件を満たさない場合はアクセスを拒否するエラーをスローし、ワークスペース外への書き込みを未然に防ぐ。

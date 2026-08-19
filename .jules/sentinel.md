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
## 2024-08-19 - HIGH DoS脆弱性（Extension Host クラッシュ）の修正
**脆弱性:** Webviewからのメッセージを受信する `onDidReceiveMessage` コールバックにおいて、ペイロード (`data`) の構造検証が欠落しており、予期せぬ入力（null や 文字列以外の command 等）が送信された場合に Extension Host がクラッシュする (DoS) リスクがありました。
**学び:** `onDidReceiveMessage` では、悪意のあるWebviewコンテンツや予期せぬスクリプトエラーから、あらゆる型のデータが送信される可能性があります。`data` や `data.command` にアクセスする前に厳密な型・構造チェックを行わないと、実行時エラーを引き起こします。
**予防策:** `onDidReceiveMessage` の先頭で必ず `typeof data === 'object'`, `data !== null`, `typeof data.command === 'string'` などの厳密な構造検証を実装し、不正なペイロードは早期に破棄 (early return) するようにします。

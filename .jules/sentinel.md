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
## 2024-08-13 - [Medium] テキストアナライザーのReDoS脆弱性を修正
**脆弱性:** `src/core/analyzer.ts` において、巨大なユーザー入力のループ内で `RegExp.exec` (`/functon/g` および `/if condtion:/g`) が使用されていました。
**学び:** ホットパス内での単純な静的文字列のマッチングにおいて、正規表現エンジンはパフォーマンスのオーバーヘッドを招き、ReDoS（Regular Expression Denial of Service）のリスクを引き起こす可能性があり、Extension Host をフリーズさせる危険があります。
**予防策:** 単純な静的文字列のマッチングでは、正規表現エンジンに依存しない `String.prototype.indexOf` をループ内で使用することを常に優先します。

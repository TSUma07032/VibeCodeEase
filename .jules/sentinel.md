## 2024-08-10 - [Medium] Fix CSP Nonce predictability
**Vulnerability:** The Webview used `Math.random()` to generate the CSP nonce.
**Learning:** `Math.random()` generates pseudo-random numbers which are predictable. If an attacker can predict the sequence, they can guess the nonce and bypass the Content-Security-Policy (CSP), potentially executing arbitrary XSS payloads in the context of the VS Code extension's Webview.
**Prevention:** Always use cryptographically secure random number generators (CSPRNG), such as Node.js's `crypto.randomBytes()`, for security-critical values like nonces, tokens, and passwords.
## 2024-08-11 - [Medium] Fix UI Spoofing via Icon Markdown
**Vulnerability:** The extension took a raw string from Webview messages and displayed it directly via `vscode.window.setStatusBarMessage`. This allowed UI spoofing, as an attacker could inject arbitrary VS Code icons using `$(icon-name)` syntax into the status bar.
**Learning:** The `setStatusBarMessage` API automatically parses and renders octicons from strings. If untrusted string input from a webview is directly passed into it, it becomes an injection vector.
**Prevention:** Sanitize user input before rendering it in UI components that support Markdown or special icon syntax. For `setStatusBarMessage`, strip out `\$\([^)]*\)` patterns.

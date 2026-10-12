# vibeCodeEase Project-Specific Rules

本ファイルは、`vibeCodeEase` プロジェクトに特有の設計方針、アーキテクチャ制約、および運用ルールを定義します。

---

## 1. エディタ同期と循環介入防止 (Side-by-Side Editor Protection)
- **フラグ保護の必須化**:
  `SideEditorProvider` において介入適用（`handleApplyIntervention`）を実行する際は、ドキュメント変更イベントによる再同期ループや競合状態を防ぐため、必ず `this._isApplyingIntervention = true` による排他フラグ保護を行い、`finally` 節で解除すること。
- **左エディタ介入の完全排除**:
  本拡張機能は Side-by-Side 構成（右側の Webview SideEditor への集約）を設計方針とするため、左エディタへの直接的な CodeAction やインラインデコレーションの追加は行わない。

## 2. ビルド成果物とテスト環境 (Build & Test Hygiene)
- **TypeScript ビルド出力のクリーンアップ**:
  `tsc -p . --outDir out` は削除されたソースファイルを自動消去しないため、テストスイートの構成変更やファイル移動を行った後は、必ず `out/` ディレクトリをクリーンアップしてからテストを実行すること。
- **UIテストと拡張機能テストの分離**:
  - Webview UI: `npm run test:ui` (Vitest)
  - VS Code Extension: `npm test` (vscode-test Mocha)

## 3. LLM設定とセキュアストレージ (Security & LLM Configuration)
- **APIキーの保存先**:
  Gemini API キーはプレーンテキストの設定ファイルではなく、VS Code の `context.secrets` (SecretStorage) を最優先で利用すること。
- **同期間隔のクランプ**:
  LLMのバックグラウンド自動解析間隔は、APIレート制限保護およびトークン消費抑制のため、5秒〜3600秒（1時間）の範囲に必ずクランプすること。

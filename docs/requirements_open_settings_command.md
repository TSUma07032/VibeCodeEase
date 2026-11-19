# 要件定義書: 専用コマンド「vibeCodeEase: 設定を開く」の新設

## 1. 概要と背景

### 1.1 背景と課題
非侵襲オンデマンド・インラインUI/UXへの刷新により、従来の常設サイドバー（AIワークスペース）を廃止し、普段はメインエディタを主役とするエディタ中心主義へ移行しました。
しかし、ユーザーがGemini APIキーの登録・変更、LLMモデル（gemini-3.5-flash-lite 等）の切り替え、推敲頻度・間隔の調整を行いたい場合に、既存の `SettingsPanel` へ直接アクセスする分かりやすい導線が存在しないという課題が生じました。

### 1.2 コアコンセプト
**「ワンクリック・ダイレクト設定アクセス」**
- コマンドパレットから直接実行可能な専用コマンド `vibecodeease.openSettings`（タイトル: `vibeCodeEase: 設定を開く`）を新設する。
- VS Code下部のステータスバー（`VibeStatusBar`）にも設定アイテム（`$(gear)`）を配置し、ワンクリックで設定パネルを開けるようにする。
- 既存の `SettingsPanel` をそのまま活用し、オンデマンド差分表示中であっても確実に設定画面へ切り替える。
- Webview初回起動時の非同期マウント遅延によるメッセージロストを防ぐため、`ready` ハンドシェイク機構を適用する。

---

## 2. 画面構成イメージ（GUIワイヤーフレーム）

### 2.1 コマンドパレットおよびステータスバーの導線
```text
【コマンドパレット (Ctrl+Shift+P / Cmd+Shift+P)】
+----------------------------------------------------------------------------------+
| > vibeCodeEase: 設定を開く                                                       |
|   vibeCodeEase: Open Settings (API Key, Model, Sync Frequency)                   |
+----------------------------------------------------------------------------------+

【VS Code 下部ステータスバー (右側配置)】
+----------------------------------------------------------------------------------+
| UTF-8   TypeScript   ...   [$(sparkle) vibeCodeEase] [$(gear) vibeCodeEase: 設定] |
+----------------------------------------------------------------------------------+
                             (priority: 100)           (priority: 99)
                                                        ↑ クリックで設定パネルを開く
```

### 2.2 設定画面展開時UI（Beside Webview）
コマンド実行またはステータスバークリック時、右側にWebviewが開き、直接 `[⚙️ Settings]` タブがアクティブな状態で表示される。

```text
+----------------------------------------------------------------------------------+
| Webview Panel (Beside)                                                           |
|----------------------------------------------------------------------------------|
| [💻 Code]  [⚙️ Settings (Active)]                                                |
|----------------------------------------------------------------------------------|
| ⚙️ vibeCodeEase 設定                                                            |
|                                                                                  |
| 🔑 Gemini API キー:                                                              |
| [ •••••••••••••••••••••••••••• ]  [保存]  [削除]                                 |
|                                                                                  |
| 🤖 LLM モデル選択:                                                               |
| [ Gemini 3.5 Flash Lite ▼ ]                                                      |
|                                                                                  |
| ⚡ 推敲レベル:                                                                   |
| ( ) Level 1 (Typo/Bug Fix)                                                       |
| (•) Level 2 (Refactoring)                                                        |
| ( ) Level 3 (Architecture Optimization)                                          |
|                                                                                  |
| ⏱️ 通信頻度・間隔:                                                               |
| [ 保存時 (onSave) ▼ ]   間隔: [ 30 ] 秒                                          |
+----------------------------------------------------------------------------------+
```

---

## 3. インタラクション・フロー（UX）要件

```mermaid
flowchart TD
    A[ユーザーのアクション: コマンド実行 または ステータスバークリック] --> B[拡張機能: vibecodeease.openSettings 発火]
    B --> C[SideEditorProvider.openSettings 呼び出し]
    C --> D{Webviewパネルの有無}
    D -- 存在しない (新規生成) --> E[BesideにWebviewパネル生成 ＆ pendingTab = 'settings' をセット]
    D -- 既に存在 (再利用) --> F[既存パネルを最前面に表示 reveal ＆ NAVIGATE_TO_SETTINGS を即時送信]
    E --> G[WebviewのReactマウント完了後に { command: 'ready' } を受信]
    G --> H[pendingTab === 'settings' を検知し NAVIGATE_TO_SETTINGS を送信してフラグクリア]
    F --> I[Webviewが NAVIGATE_TO_SETTINGS を受信]
    H --> I
    I --> J[Webview側で onDemandDetail = null ＆ activeTab = 'settings' に設定]
    J --> K[SettingsPanel を即座に描画]
    K --> L[ユーザーが設定を変更・保存]
```

### 3.1 トリガー仕様
1. **コマンドパレット**: `vibeCodeEase: 設定を開く` (`vibecodeease.openSettings`)
2. **ステータスバー**:
   - `VibeStatusBar` に第2のステータスバーアイテム `settingsStatusBarItem` を追加。
   - `alignment`: `vscode.StatusBarAlignment.Right`
   - `priority`: `99`（既存のモード表示アイテム priority: 100 の隣）
   - `text`: `$(gear) vibeCodeEase: 設定`
   - `tooltip`: `vibeCodeEase: 設定を開く (APIキー・モデル・推敲間隔)`
   - `command`: `vibecodeease.openSettings`

### 3.2 ライフサイクルとハンドシェイク制御
- `SideEditorProvider` はプロパティ `private pendingTab?: 'code' | 'settings'` を保持する。
- **新規パネル起動時**:
  - `this.pendingTab = 'settings'` を設定し、`openSideEditor()` を呼び出す。
  - Webview側Reactの初期化完了時に送られる `{ command: 'ready' }` を受信したハンドラ内で、`this.pendingTab === 'settings'` であれば `{ type: 'NAVIGATE_TO_SETTINGS' }` を Webview へ送信し、`this.pendingTab = undefined` にクリアする。
- **既存パネル起動時**:
  - `this.panel.reveal(vscode.ViewColumn.Beside)` を呼び出し、即座に `{ type: 'NAVIGATE_TO_SETTINGS' }` を送信する。
- **Webview側の画面切り替え動作**:
  - Webviewは `{ type: 'NAVIGATE_TO_SETTINGS' }` を受信すると、ローカル状態の `setOnDemandDetail(null)` および `setActiveTab('settings')` を実行する（Extension側の介入セッションを強制終了するメッセージは送信せず、UI状態の切り替えのみを行う）。

### 3.3 コマンド登録の責務
- `src/extension.ts` の `registerExtensionCommands` 内で `vscode.commands.registerCommand('vibecodeease.openSettings', () => sideEditorProvider.openSettings())` を登録する。

---

## 4. API / IPC メッセージ契約 (I/O仕様)

### 4.1 型定義の追加箇所
1. **Extensionホスト側**: `src/types/webviewMessage.ts` の `ExtensionToWebviewMessage`
2. **Webview側**: `webview-ui/src/types.ts` の `ExtensionToWebviewMessage`

### 4.2 メッセージ仕様
- **`NAVIGATE_TO_SETTINGS`**:
  - 型定義:
    ```typescript
    | { type: 'NAVIGATE_TO_SETTINGS' }
    ```
  - ペイロード具体例:
    ```json
    {
      "type": "NAVIGATE_TO_SETTINGS"
    }
    ```
  - 目的: Webviewに対し、オンデマンド差分表示中であればそれを解除し、タブを強制的に `settings` に切り替えて表示させる。

---

## 5. package.json コントラクト仕様

### 5.1 コマンド宣言 (`contributes.commands`)
```json
{
  "command": "vibecodeease.openSettings",
  "title": "vibeCodeEase: 設定を開く"
}
```

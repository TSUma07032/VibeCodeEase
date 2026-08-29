# vibeCodeEase システム仕様書 & アーキテクチャ設計書

本ドキュメントは、VS Code拡張機能 **vibeCodeEase** の全体設計、モジュール責務、データフロー、セキュリティ仕様、およびテスト戦略をまとめた仕様書です。

---

## 1. プロジェクト概要

- **名称**: `vibeCodeEase`
- **目的**: 開発者の作業ストレス（Pain）傾向や学習ニーズに合わせ、タイポ修正や構文エラーなどの介入レベル（サイレント自動修正・サジェスト提案・自力解決スキップ）を動的に最適化する、AIアシスタント・学習支援拡張機能。
- **主要機能**:
  - **プリセットモード**: 🎓 学習モード (Learning), ⚡ フローモード (Flow), 🛠️ 職人モード (Zen), ⚙️ カスタム調整 (Custom)
  - **介入判定エンジン**: ユーザーの嗜好値（0.0〜1.0）に基づき、エディタUIの介入レベルを動的に制御
  - **言語不問のリアルタイム検知**: VS Code Diagnostics（言語サーバーの赤波線）をフックし、全言語のエラーを分類
  - **保存時サイレント修正**: `onWillSaveTextDocument` によるタイポ等の安全な自動修正
  - **行動ログ & 適応型提案**: ユーザーの受容パターンを分析し、最適なモード変更をプロアクティブに提案
- **技術スタック**:
  - **Extension Host**: TypeScript, VS Code API (`vscode.lm`, `vscode.languages`, `SecretStorage`, `WebviewView`)
  - **フロントエンド UI**: React 19, Vite, TypeScript, Vanilla CSS (VS Code Native Theme variables)
  - **LLM連携**: Google Generative Language API (Gemini REST API), VS Code Language Model API
  - **テスト環境**: Mocha, `@vscode/test-cli`, `@vscode/test-electron`

---

## 2. 全体アーキテクチャ

```mermaid
graph TB
    subgraph VS Code Editor Native
        DOC[Active TextDocument]
        EDIT[WorkspaceEdit / TextEdit]
        HOVER_UI[Hover Tooltip]
        QUICKFIX_UI[QuickFix Menu]
        STATUS_UI[Status Bar]
        DIAG[VS Code Diagnostics]
    end

    subgraph vibeCodeEase Extension Host
        EXT[extension.ts]
        
        subgraph Core Analyzers & Engine
            IE[InterventionEngine]
            CA[CodeAnalyzer]
            DS[DiagnosticsService]
            SFS[SilentFixService]
            HP[VibeHoverProvider]
            CAP[VibeCodeActionProvider]
        end

        subgraph Research & Adaptive
            ALS[ActionLogService]
            AE[AdaptiveEngine]
        end

        subgraph LLM Integration Subsystem
            LIS[LlmInterventionService]
            PB[PromptBuilder]
            PV[PlanValidator]
            GC[GeminiClient]
            VLC[VscodeLmClient]
        end

        subgraph Webview & UI Control
            SP[SidebarProvider]
            WMH[WebviewMessageHandler]
            SB[VibeStatusBar]
        end

        subgraph State & Storage
            GS[GlobalState]
            SEC[SecretStorage]
            CSV[(research_action_log.csv)]
        end
    end

    subgraph Webview UI (React)
        REACT_APP[React App / Presets & Sliders]
    end

    subgraph External LLM APIs
        GEMINI[Gemini REST API]
        VSCODE_LM[VS Code Language Models]
    end

    %% Wiring
    EXT --> SP
    EXT --> HP
    EXT --> CAP
    EXT --> SB
    EXT --> GS
    EXT --> DS
    EXT --> SFS
    EXT --> ALS
    EXT --> AE

    SP --> WMH
    WMH <--> REACT_APP
    WMH --> LIS
    WMH --> SEC
    WMH --> EDIT
    EDIT --> DOC

    HP --> CA
    HP --> IE
    CAP --> CA
    CAP --> IE
    HP --> HOVER_UI
    CAP --> QUICKFIX_UI

    DS --> DIAG
    SFS --> DOC
    SFS --> EDIT

    WMH --> ALS
    WMH --> AE
    ALS --> CSV

    LIS --> PB
    LIS --> PV
    LIS --> GC
    LIS --> VLC
    GC <--> GEMINI
    VLC <--> VSCODE_LM
```

---

## 3. モジュール一覧と責務

| ディレクトリ / ファイル | 責務 |
| :--- | :--- |
| **`src/extension.ts`** | 拡張機能のエントリポイント。全サービス（Provider, Diagnostics, SilentFix, ActionLog, AdaptiveEngine）の登録と配線。 |
| **`src/core/interventionEngine.ts`** | 嗜好値（0.0〜1.0）からの介入レベル（`SILENT` / `SUGGESTION` / `IGNORE`）判定、および学習用解説ヒント（Learning Hint）の生成。 |
| **`src/core/diagnosticsService.ts`** | VS Code Diagnostics（言語サーバーエラー）を購読し、言語不問でPainCategoryへマッピング。 |
| **`src/core/silentFixService.ts`** | 保存時（`onWillSaveTextDocument`）に `SILENT` 判定の安全な問題を自動適用。 |
| **`src/core/actionLogService.ts`** | 研究・評価実験用に、承認/却下/モード変更を `research_action_log.csv` へ安全に追記。 |
| **`src/core/adaptiveEngine.ts`** | ユーザーの受容履歴を分析し、SILENT化やモード変更をプロアクティブに提案。 |
| **`src/core/analyzer.ts`** | タイポ・構文エラーの静的コード解析器。 |
| **`src/core/HoverProvider.ts`** | 介入判定エンジンと連動し、学習モード時は教育的ヒント、IGNORE時は抑制するホバー表示。 |
| **`src/core/CodeActionProvider.ts`** | 介入判定エンジンと連動し、学習モード時はタイトルに教育的アイコン・文言を付加したQuickFixを提供。 |
| **`src/core/llmInterventionService.ts`**| LLM連携サブシステムのファサード（Facade）。プロンプト作成・モデル選択・検証を統括。 |
| **`src/vscode-utils/SidebarProvider.ts`**| Webview View の初期化、HTML/CSP生成、ライフサイクル管理。 |
| **`src/vscode-utils/WebviewMessageHandler.ts`**| 設定同期（`GET_SETTINGS`, `SET_PRESET`）、プラン適用、アクションコールバック管理。 |
| **`src/vscode-utils/StatusBar.ts`** | エディタ最下部に現在の動作モードを表示し、`GlobalState` 変更にリアルタイム連動。 |
| **`src/state/globalState.ts`** | プリセット（Learning/Flow/Zen/Custom）および各カテゴリ嗜好値の永続化と変更通知。 |
| **`src/types/`** | `PresetMode`, `PainCategory`, `InterventionLevel`, `UserPreferenceProfile` 等の共通型定義。 |
| **`webview-ui/`** | プリセット選択カード、スライダーマトリクス、学習ポイントプレビューを備えたReact製UI。 |

---

## 4. テスト・品質管理戦略

- **単体テスト実行コマンド**: `npm test`
- **全31件のテスト構成**:
  - **`types.test.ts`**: カテゴリ解析、嗜好値クランプ関数
  - **`promptBuilder.test.ts`**: JSON Schema 定義およびプロンプト生成
  - **`planValidator.test.ts`**: CRLF/LFオフセット変換、正常プラン解析、不正スキーマ拒否
  - **`interventionEngine.test.ts`**: 介入レベル判定、境界値、プリセットデフォルト値、学習ヒント文検証
  - **`adaptiveEngine.test.ts`**: 連続承認カウント、カテゴリ別受容履歴検証
  - **`analyzer.test.ts`**: タイポ検出ロジックテスト
  - **`extension.test.ts`**: 拡張機能ロードテスト

# Test Cases: AI Workspace Sidebar Integration

This document outlines the unit and End-to-End (E2E) test cases for the "AI Workspace Sidebar Integration" feature of vibeCodeEase.

## 1. E2E Test Scenarios

### 1.1 Transition of the AI Workspace to the Sidebar Webview
**Scenario 1: Sidebar Activation and Layout**
*   **Description:** Verify that the AI Workspace is fully integrated into the VS Code Sidebar Webview.
*   **Steps:**
    1. Open the VS Code Extension sidebar.
    2. Click on the vibeCodeEase icon.
*   **Expected Results:**
    *   The main view within the sidebar displays the "AI Review Screen".
    *   The settings screen (e.g., Pain matrix) is not visible by default on the main view.
    *   A settings icon (⚙️) is visible at the top, which opens the settings view in a separate modal or routed view.
    *   The user's main editor workspace is not occupied by AI diffs or workspaces.

**Scenario 2: Settings Navigation**
*   **Description:** Verify that clicking the settings icon navigates away from the main review view.
*   **Steps:**
    1. Click the ⚙️ Settings icon in the sidebar.
*   **Expected Results:**
    *   The settings screen (Pain matrix, etc.) opens in a separate screen or modal, leaving the main review area free upon return.

### 1.2 Code Viewer and File Selector
**Scenario 3: File Selector Functionality**
*   **Description:** Verify that the file selector lists files with AI suggestions and switches the code viewer context.
*   **Steps:**
    1. Ensure there are multiple files with AI proposals.
    2. Open the AI Review Screen in the sidebar.
    3. Open the file selector dropdown in the header.
*   **Expected Results:**
    *   The dropdown lists all files currently being analyzed or updated by the AI.
    *   Selecting a different file updates the Code Viewer to show the AI-modified code for the selected file.

**Scenario 4: Code Viewer Highlighting and Comments**
*   **Description:** Verify that the embedded code viewer displays code correctly with syntax highlighting, change highlights, and AI comments.
*   **Steps:**
    1. Select a file in the AI Review Screen.
*   **Expected Results:**
    *   The full code for the selected file (AI version) is displayed.
    *   Syntax highlighting is active (e.g., via Monaco Editor).
    *   Lines with AI changes are explicitly highlighted (different background color or decoration).
    *   Educational/learning AI comments explaining the changes (reasons, design improvements) are displayed near or inline with the modified lines.

### 1.3 'Apply' / 'Apply All' Interactions
**Scenario 5: Individual Apply (✨ Apply)**
*   **Description:** Verify that clicking "Apply" for a specific change only updates that snippet in the user's workspace.
*   **Steps:**
    1. Locate a specific AI proposed change and its educational comment in the Code Viewer.
    2. Click the "✨ Apply" button next to that specific change.
*   **Expected Results:**
    *   Only the specific code snippet is applied to the actual file in the user's active VS Code editor.
    *   Other AI proposed changes in the same file remain unapplied.
    *   The sidebar view updates to reflect the new state (the applied change might no longer be highlighted as a difference).

**Scenario 6: Bulk Apply (🚀 Apply All)**
*   **Description:** Verify that clicking "Apply All" updates all AI suggestions for the currently selected file.
*   **Steps:**
    1. Ensure the currently selected file has multiple AI changes.
    2. Click the "🚀 Apply All" button at the top of the sidebar.
*   **Expected Results:**
    *   All proposed AI changes for the current file are applied to the actual file in the user's active VS Code editor.
    *   The sidebar code viewer updates to show no remaining differences for that file.

### 1.4 Data Syncing
**Scenario 7: Real-time User Edit Syncing**
*   **Description:** Verify that user edits in the main editor immediately sync with the AI workspace baseline.
*   **Steps:**
    1. Open a file that has AI suggestions in the sidebar.
    2. In the main VS Code editor, make manual edits to the file and save it.
*   **Expected Results:**
    *   The AI Workspace in the sidebar immediately updates its baseline to match the newly saved code.
    *   The AI proposals are recalculated and displayed correctly against the new baseline.

---

## 2. Unit Tests

### 2.1 Sidebar Webview Rendering
*   **`SidebarProvider.test.ts`:**
    *   Test that the main view renders the `AIReviewScreen` component by default.
    *   Test that clicking the settings icon triggers state/routing change to render the Settings component.

### 2.2 Component Level Tests
*   **`FileSelector.test.tsx`:**
    *   Test that it renders a dropdown with the list of files provided in props.
    *   Test that it calls the `onSelectFile` callback when a new file is chosen.
*   **`CodeViewer.test.tsx`:**
    *   Mock Monaco Editor.
    *   Test that it renders the full AI code string.
    *   Test that it calculates and passes correct line decorations for AI-changed lines.
    *   Test that it renders inline AI educational comments at the correct line numbers.
*   **`ApplyButton.test.tsx` (✨ Apply):**
    *   Test that clicking triggers the `onApplySnippet` callback with the correct snippet ID / line range.
*   **`ApplyAllButton.test.tsx` (🚀 Apply All):**
    *   Test that clicking triggers the `onApplyAll` callback for the current file ID.

### 2.3 Business Logic & Utilities
*   **`DiffCalculator.test.ts`:**
    *   Test the diff calculation logic between the user's current code and the AI's proposed code to ensure change blocks are accurately identified.
*   **`WorkspaceSyncService.test.ts`:**
    *   Test the event listener for VS Code file save/edit events.
    *   Test that when a file changes, the service updates the internal state and triggers a re-render/re-calculation of the AI diffs.
*   **`ApplyActionHandler.test.ts`:**
    *   Test the logic that maps a snippet ID to actual VS Code `TextEditorEdit` operations.
    *   Test the `applyAll` logic to apply multiple edits safely without offset errors.

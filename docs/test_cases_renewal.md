# vibeCodeEase: UI/UX Renewal Test Cases

This document defines the comprehensive test cases (E2E and unit tests) for the renewed vibeCodeEase UI/UX, focusing on the 2-pane non-intrusive learning experience, the 3 interaction cycles, and the GitHub-style Diff UI.

## 1. E2E Test Scenarios: 3 Interaction Cycles

### 1.1 User To User (Local Work)
*   **Description:** Verify that the AI extension does not interfere with the user's active coding sessions.
*   **Steps:**
    1. Open a file in the main VS Code editor (Left side).
    2. Start typing, formatting, and navigating through the file.
*   **Expected Results:**
    *   The editor remains fully responsive.
    *   No blocking pop-ups, forced focus changes, or automatic overwrites occur in the left-side workspace while the user is typing.

### 1.2 User To AI Workspace (Immediate Synchronization)
*   **Description:** Verify that the user's code changes are immediately synced to the AI workspace baseline upon saving.
*   **Steps:**
    1. Make changes to a file in the main editor.
    2. Save the file (e.g., `Ctrl+S` / `Cmd+S`).
    3. Observe the right-side AI Workspace sidebar.
*   **Expected Results:**
    *   The baseline code in the AI workspace updates instantly to match the newly saved code.
    *   The AI automatically begins re-evaluating the code based on the new baseline.

### 1.3 AI To AI Workspace (Asynchronous Self-Improvement)
*   **Description:** Verify that the AI continuously analyzes and improves the AI Workspace code in the background.
*   **Steps:**
    1. Leave the editor idle after a save or wait for the configured background polling interval.
    2. Monitor the right-side AI Workspace sidebar.
*   **Expected Results:**
    *   The AI processes the code without locking the user's main editor.
    *   Once the analysis is complete, the right-side sidebar silently updates to display the newly improved AI version of the code.

---

## 2. E2E Test Scenarios: GitHub-style Diff UI & Sidebar Code Viewer

### 2.1 Full Code Display & Layout
*   **Description:** Verify that the sidebar displays the entire AI-improved code using an embedded code viewer.
*   **Steps:**
    1. Open the vibeCodeEase AI Workspace sidebar.
    2. Ensure an AI-improved file is selected.
*   **Expected Results:**
    *   The *entire* source code (not just diff snippets) of the AI's version is visible in the viewer.
    *   Syntax highlighting is fully functional.
    *   The code viewer has `wordWrap: 'on'` applied, allowing the code to wrap within the narrow sidebar without requiring horizontal scrolling.

### 2.2 Change Highlighting
*   **Description:** Verify that AI modifications are visually distinguished from the baseline code.
*   **Steps:**
    1. Look at an AI-improved file in the sidebar Code Viewer.
*   **Expected Results:**
    *   Lines changed or added by the AI are highlighted with a distinct background color (similar to GitHub's diff view).
    *   Unchanged lines appear with the standard editor background.

### 2.3 Learning Popovers
*   **Description:** Verify that educational feedback is provided for AI changes.
*   **Steps:**
    1. Hover over or click on a highlighted change line in the sidebar Code Viewer.
*   **Expected Results:**
    *   An inline popover or comment window appears.
    *   The popover displays the AI's explanation, detailing "Reasons for the change" and "Design improvement points".

### 2.4 Settings Isolation
*   **Description:** Verify that settings do not clutter the AI review interface.
*   **Steps:**
    1. Click the "⚙️" (Settings) icon in the sidebar header.
*   **Expected Results:**
    *   The view toggles to the settings screen (e.g., Pain matrix configuration).
    *   Toggling back restores the spacious AI review code viewer.

---

## 3. E2E Test Scenarios: Apply Interactions

### 3.1 Individual Apply ("✨ Apply")
*   **Description:** Verify that users can apply a single AI suggestion to their workspace.
*   **Steps:**
    1. Open a learning popover for a specific highlighted change in the sidebar.
    2. Click the "✨ Apply" (or individual apply) button inside the popover.
*   **Expected Results:**
    *   Only that specific code block is updated in the user's main left-side editor.
    *   Other pending AI changes in the file remain unaffected.
    *   The applied change is no longer highlighted as a difference in the sidebar.

### 3.2 Bulk Apply ("🚀 Apply All")
*   **Description:** Verify that users can apply all AI suggestions for the current file at once.
*   **Steps:**
    1. Ensure the sidebar is displaying a file with multiple AI changes.
    2. Click the "🚀 Apply All" button in the panel header.
*   **Expected Results:**
    *   All AI suggestions for the currently displayed file are simultaneously applied to the user's left-side editor.
    *   The sidebar code viewer updates to reflect zero differences against the user's workspace.

---

## 4. Unit Tests

### 4.1 UI Components
*   **`SidebarWebviewProvider.test.ts`:**
    *   Verify the webview correctly mounts the React app and handles messages.
    *   Verify settings toggle state transitions correctly between `ReviewMode` and `SettingsMode`.
*   **`FullCodeViewer.test.tsx`:**
    *   Mock the code viewer (e.g., Monaco Editor).
    *   Assert that `wordWrap: 'on'` is passed in the viewer options.
    *   Assert that the component renders the full text content provided by the props.
*   **`DiffHighlighter.test.ts`:**
    *   Test that diffing the user code against AI code returns correct line ranges for highlighting.
    *   Verify that GitHub-style line decorations are accurately generated for modified lines.
*   **`LearningPopover.test.tsx`:**
    *   Test that the popover renders the AI explanation text correctly.
    *   Verify the "✨ Apply" button fires the `onApplyIndividual` callback with the correct diff block ID.
*   **`HeaderPanel.test.tsx`:**
    *   Verify the "🚀 Apply All" button fires the `onApplyAll` callback.

### 4.2 Services & Core Logic
*   **`InteractionSyncService.test.ts`:**
    *   Test the `onDidSaveTextDocument` event listener.
    *   Verify that saving a document immediately triggers a baseline update for the AI Workspace state.
*   **`LLMBackgroundService.test.ts`:**
    *   Test the asynchronous polling mechanism.
    *   Verify that self-improvement cycles run in the background and correctly emit `onWorkspaceImproved` events when new AI code is generated.
*   **`ApplyActionManager.test.ts`:**
    *   Test mapping sidebar snippet applies to VS Code `TextEditorEdit` commands.
    *   Verify that individual apply accurately replaces the target lines without offsetting the rest of the file.
    *   Verify that bulk apply processes edits from bottom to top (or uses VS Code's batch edit) to avoid line shifting issues.

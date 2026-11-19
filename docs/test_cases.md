# Test Cases for vibeCodeEase UI/UX Redesign

## 1. Unit Tests

### 1.1 Synchronization (User To AI Workspace)
**Test Case:** `test_on_file_save_syncs_to_ai_workspace`
- **Description:** Verifies that saving a file in the active editor triggers a synchronization event to the AI workspace.
- **Inputs:** Mock VS Code `onDidSaveTextDocument` event with sample code content.
- **Expected Output:** The AI workspace's base code model is updated with the new sample code content immediately.

### 1.2 Background Service (AI To AI Workspace)
**Test Case:** `test_background_service_polling`
- **Description:** Verifies that `llmBackgroundService` triggers analysis at defined intervals.
- **Inputs:** Mock timer/interval trigger.
- **Expected Output:** An AI analysis job is queued/executed without blocking the main thread.

### 1.3 Diff Computation
**Test Case:** `test_diff_provider_computes_differences`
- **Description:** Ensures the diff algorithm correctly identifies additions, deletions, and modifications between User Code and AI Code.
- **Inputs:** String A (User Code), String B (AI Code).
- **Expected Output:** Array of diff hunks with correct line numbers and modification types.

### 1.4 Highlight & Decoration Generation
**Test Case:** `test_generate_diff_decorations`
- **Description:** Verifies that diff hunks are translated into VS Code TextEditor decorations or Webview highlight classes.
- **Inputs:** Array of diff hunks.
- **Expected Output:** Decoration objects targeting the specific lines in the AI workspace view.

### 1.5 Comment Mapping
**Test Case:** `test_map_ai_feedback_to_diff_lines`
- **Description:** Checks if AI-generated feedback (reasons, improvements) is correctly mapped to the corresponding diff lines.
- **Inputs:** AI JSON response with line numbers and feedback, array of diff hunks.
- **Expected Output:** Data structure linking specific UI line numbers to their respective AI feedback comments.

## 2. End-to-End (E2E) Test Scenarios

### 2.1 Interaction Cycle 1: Unblocked User Experience (User to User)
**Scenario:** User types continuously while AI analyzes in the background.
- **Steps:**
  1. Open a file and start typing continuously.
  2. Trigger a background AI analysis manually or via a timer.
  3. Continue typing.
- **Expected Result:** The editor remains completely responsive. No UI freezing, stuttering, or modal blocking occurs.

### 2.2 Interaction Cycle 2: Save and Sync (User To AI Workspace)
**Scenario:** User saves a file, triggering an immediate sync to the AI workspace.
- **Steps:**
  1. Modify code in the user editor.
  2. Press `Ctrl+S` (or `Cmd+S`) to save the file.
  3. Inspect the AI workspace's base model state.
- **Expected Result:** The AI workspace's base model perfectly matches the saved user code. Any ongoing obsolete AI tasks for that file are cancelled or superseded.

### 2.3 Interaction Cycle 3: Autonomous AI Improvement (AI To AI Workspace)
**Scenario:** The background service autonomously improves the AI workspace code.
- **Steps:**
  1. Ensure a file is synced to the AI workspace.
  2. Wait for the background polling interval to trigger (or mock the trigger).
  3. Observe the AI workspace state.
- **Expected Result:** The AI workspace code is updated with improvements (e.g., better variable names, refactored logic) without any user intervention.

### 2.4 Diff UI: Layout and Highlights
**Scenario:** User opens the AI panel to view the GitHub-style Diff UI.
- **Steps:**
  1. Trigger an AI improvement so the AI workspace has different code than the user workspace.
  2. Open the AI Workspace panel (Sidebar/Dedicated View).
- **Expected Result:** 
  - The panel displays only the AI's version of the code.
  - Lines containing changes (compared to the user's current code) are visually highlighted (e.g., background color changed).

### 2.5 Diff UI: Interactive Feedback Popovers
**Scenario:** User clicks on a highlighted diff line to view AI feedback.
- **Steps:**
  1. Open the AI Workspace panel with visible diff highlights.
  2. Click on one of the highlighted lines.
- **Expected Result:** A popover or inline widget appears, displaying the AI's feedback (e.g., "AIによる変更理由", "設計上の改善ポイント", "ミスの解説").

### 2.6 Diff UI: Applying Changes
**Scenario:** User applies an AI suggestion to their local editor.
- **Steps:**
  1. Open the AI Workspace panel and click a highlighted diff line to show the popover.
  2. Click the "Apply" or "Accept" button inside the popover/diff view.
- **Expected Result:** 
  - The suggested code is inserted/replaced in the user's active editor at the correct location.
  - The highlight disappears from the AI Workspace panel since the codes now match.

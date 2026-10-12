import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';

// Mock the VSCode API
vi.mock('../utils/vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
  },
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the model dropdown optimistically when selected', () => {
    render(
      <SettingsPanel
        hasApiKey={false}
        apiKeyLength={0}
        aiInterventionLevel="Level 2 (Refactoring)"
        frequency="onSave"
        intervalSeconds={10}
        model="gemini-3.5-flash-lite"
        onUpdateApiKey={vi.fn()}
        onUpdateLevel={vi.fn()}
        onForceAnalyze={vi.fn()}
      />
    );

    // Note: React Testing Library might need us to select by something else since we don't have aria-label.
    // Let's add a test id or label in the component later, but for now we can find all selects and get the second one, or use getByDisplayValue.
    const selects = screen.getAllByRole('combobox');
    const select = selects[1]; // The Model select
    
    expect(select).toHaveValue('gemini-3.5-flash-lite');

    // ユーザーが変更
    fireEvent.change(select, { target: { value: 'gemini-3.8-flash' } });

    // 即座にUIが更新されること
    expect(select).toHaveValue('gemini-3.8-flash');
  });

  it('sets the placeholder of the API key input to a mask of the same length', () => {
    render(
      <SettingsPanel
        hasApiKey={true}
        apiKeyLength={12}
        aiInterventionLevel="Level 2 (Refactoring)"
        frequency="onSave"
        intervalSeconds={10}
        model="gemini-3.5-flash-lite"
        onUpdateApiKey={vi.fn()}
        onUpdateLevel={vi.fn()}
        onForceAnalyze={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('************');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('************');
  });
});

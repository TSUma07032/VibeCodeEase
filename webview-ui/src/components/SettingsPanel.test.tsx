import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { vscode } from '../utils/vscode';

vi.mock('../utils/vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
  },
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the model dropdown optimistically and uses localModel on subsequent interval blur', () => {
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

    const selects = screen.getAllByRole('combobox');
    const select = selects[1]; // The Model select
    expect(select).toHaveValue('gemini-3.5-flash-lite');

    fireEvent.change(select, { target: { value: 'gemini-3.8-flash' } });
    expect(select).toHaveValue('gemini-3.8-flash');

    const intervalInput = screen.getByRole('spinbutton');
    fireEvent.change(intervalInput, { target: { value: '25' } });
    fireEvent.blur(intervalInput);

    expect(vscode.postMessage).toHaveBeenLastCalledWith({
      command: 'update_llm_config',
      frequency: 'onSave',
      intervalSeconds: 25,
      model: 'gemini-3.8-flash',
    });
  });

  it('sets the placeholder of the API key input to a mask and does NOT delete the key on focus+empty blur', () => {
    const onUpdateApiKey = vi.fn();
    render(
      <SettingsPanel
        hasApiKey={true}
        apiKeyLength={12}
        aiInterventionLevel="Level 2 (Refactoring)"
        frequency="onSave"
        intervalSeconds={10}
        model="gemini-3.5-flash-lite"
        onUpdateApiKey={onUpdateApiKey}
        onUpdateLevel={vi.fn()}
        onForceAnalyze={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('************');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('************');

    // Focus clears the mask for typing, but blurring without typing must restore mask and NOT call onUpdateApiKey('')
    fireEvent.focus(input);
    expect(input).toHaveValue('');
    fireEvent.blur(input);
    expect(input).toHaveValue('************');
    expect(onUpdateApiKey).not.toHaveBeenCalled();
  });

  it('switches between General and Learning subtabs', () => {
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

    fireEvent.click(screen.getByText('🎓 学習支援設定'));
    expect(screen.getByTestId('settings-skeleton')).toBeInTheDocument();

    fireEvent.click(screen.getByText('🔧 全般・自動推敲'));
    expect(screen.getByText('API Key')).toBeInTheDocument();
  });
});


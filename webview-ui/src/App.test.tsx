import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { MirrorEditor } from './components/MirrorEditor';
import { ProposalPopup } from './components/ProposalPopup';
import type { WebviewIntervention } from './types';


import { mockPostMessage } from './test/setup';

describe('App Component', () => {
  it('shows waiting message initially in code tab', () => {
    render(<App />);
    expect(screen.getByText('Waiting for document sync...')).toBeDefined();
  });

  it('renders SettingsPanel when Settings tab is clicked', () => {
    render(<App />);
    const settingsTab = screen.getByText('[⚙️ Settings]');
    fireEvent.click(settingsTab);
    expect(screen.getByText('API Key')).toBeDefined();
    expect(screen.getByText('🚀 今すぐコードを推敲する (Analyze Now)')).toBeDefined();
  });

  it('sends update_api_key message on API key input blur', () => {
    render(<App />);
    fireEvent.click(screen.getByText('[⚙️ Settings]'));
    const input = screen.getByPlaceholderText('Enter API Key');
    fireEvent.change(input, { target: { value: 'new-api-key' } });
    fireEvent.blur(input);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'update_api_key', apiKey: 'new-api-key' });
  });

  it('sends update_intervention_level message on level select change', () => {
    render(<App />);
    fireEvent.click(screen.getByText('[⚙️ Settings]'));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'Level 2 (Refactoring)' } });
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'update_intervention_level', level: 'Level 2 (Refactoring)' });
  });

  it('sends force_analyze message on button click', () => {
    render(<App />);
    fireEvent.click(screen.getByText('[⚙️ Settings]'));
    const button = screen.getByText('🚀 今すぐコードを推敲する (Analyze Now)');
    fireEvent.click(button);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'force_analyze' });
  });
});

describe('MirrorEditor Component', () => {
  const dummyIntervention: WebviewIntervention = {
    id: '123',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    originalText: 'const',
    replacementText: 'let',
    message: 'Use let'
  };

  it('renders text with line numbers', () => {
    render(<MirrorEditor text={"line 1\nline 2"} interventions={[]} onApply={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText('line 1')).toBeDefined();
    expect(screen.getByText('line 2')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('shows bulb icon when there is an intervention', () => {
    render(<MirrorEditor text="const x = 1;" interventions={[dummyIntervention]} onApply={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByTitle('View AI Proposal')).toBeDefined();
  });
});

describe('ProposalPopup Component', () => {
  const dummyIntervention: WebviewIntervention = {
    id: '123',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    originalText: 'const',
    replacementText: 'let',
    message: 'Use let'
  };

  it('renders diff texts and buttons', () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    render(<ProposalPopup intervention={dummyIntervention} onApply={onApply} onDiscard={onDiscard} />);
    
    expect(screen.getByText('Use let')).toBeDefined();
    expect(screen.getByText('const')).toBeDefined();
    expect(screen.getByText('let')).toBeDefined();
    
    fireEvent.click(screen.getByText('[反映 (Accept)]'));
    expect(onApply).toHaveBeenCalledWith(dummyIntervention);

    fireEvent.click(screen.getByText('[破棄 (Discard)]'));
    expect(onDiscard).toHaveBeenCalledWith('123');
  });
});

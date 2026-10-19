import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { MirrorEditor } from './components/MirrorEditor';
import { ProposalPopup } from './components/ProposalPopup';
import type { LearningSessionState, WebviewIntervention } from './types';
import { mockPostMessage } from './test/setup';

describe('App Component', () => {
  it('shows waiting message initially in code tab and sends ready message', () => {
    render(<App />);
    expect(screen.getByText('Waiting for document sync...')).toBeDefined();
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'ready' });
  });

  it('syncs document and interventions via IPC and handles apply/discard', () => {
    render(<App />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_DOCUMENT',
            fileName: '/workspace/src/demo.ts',
            text: 'functon test() {}\r\nconst a = 1;',
          },
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'UPDATE_INTERVENTIONS',
            interventions: [
              {
                id: 'int-1',
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                originalText: 'functon',
                replacementText: 'function',
                message: 'Fix typo',
              },
            ],
          },
        })
      );
    });

    expect(screen.getByText('demo.ts')).toBeInTheDocument();
    expect(screen.getByText('functon test() {}')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('View AI Proposal'));
    expect(screen.getByText('Fix typo')).toBeInTheDocument();

    fireEvent.click(screen.getByText('[反映 (Accept)]'));
    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'apply_intervention',
      id: 'int-1',
      newText: 'function',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
    });
  });

  it('retains learning session state when switching to Learning tab after SYNC_SESSION_STATE', () => {
    render(<App />);
    const sessionState: LearningSessionState = {
      taskId: 't-1',
      taskDescription: 'React Hooks課題',
      learningGoal: 'useEffect理解',
      status: 'loading',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: null,
      assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
      snoozeUntilTimestamp: null,
      isDismissed: false,
      lastUpdatedTimestamp: Date.now(),
      history: [],
    };

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'SYNC_SESSION_STATE', payload: sessionState },
        })
      );
    });

    fireEvent.click(screen.getByText('[🎓 学習支援]'));
    expect(screen.getByText(/AIがあなたのコードから完成形の予想図を準備しています/)).toBeInTheDocument();
  });

  it('handles Dashboard IPC messages (LLM_DASHBOARD_INIT, LLM_STATUS_UPDATE, LLM_RESPONSE_UPDATE, LLM_ERROR_LOG)', () => {
    render(<App />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'LLM_DASHBOARD_INIT',
            status: 'idle',
            response: { text: 'Initial Summary', timestamp: 1000 },
            logs: [],
          },
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'LLM_STATUS_UPDATE', status: 'error' },
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'LLM_RESPONSE_UPDATE', text: 'Updated Generic<T>', timestamp: 2000 },
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'LLM_ERROR_LOG', message: 'Quota exceeded', timestamp: 3000 },
        })
      );
    });

    fireEvent.click(screen.getByText('[📊 Dashboard]'));
    expect(screen.getByText('❌ エラー')).toBeInTheDocument();
    expect(screen.getByText('Updated Generic<T>')).toBeInTheDocument();
  });

  it('renders SettingsPanel when Settings tab is clicked and sends settings commands', () => {
    render(<App />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_SETTINGS',
            hasApiKey: false,
            apiKeyLength: 0,
            interventionLevel: 'Level 1 (Typo/Bug Fix)',
            frequency: 'interval',
            intervalSeconds: 20,
            model: 'gemini-2.5-flash',
          },
        })
      );
    });

    fireEvent.click(screen.getByText('[⚙️ Settings]'));
    const input = screen.getByPlaceholderText('Enter API Key');
    fireEvent.change(input, { target: { value: 'new-api-key' } });
    fireEvent.blur(input);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'update_api_key', apiKey: 'new-api-key' });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'Level 2 (Refactoring)' } });
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'update_intervention_level', level: 'Level 2 (Refactoring)' });

    fireEvent.click(screen.getByText('🚀 今すぐコードを推敲する (Analyze Now)'));
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'force_analyze' });
  });
});

describe('MirrorEditor & ProposalPopup Components', () => {
  const dummyIntervention: WebviewIntervention = {
    id: '123',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    originalText: 'const',
    replacementText: 'let',
    message: 'Use let',
  };

  it('renders text with line numbers and toggles popup on bulb click and discard', () => {
    const onDiscard = vi.fn();
    render(
      <MirrorEditor
        text={'const x = 1;\r\nline 2'}
        interventions={[dummyIntervention]}
        onApply={vi.fn()}
        onDiscard={onDiscard}
      />
    );
    expect(screen.getByText('const x = 1;')).toBeDefined();
    expect(screen.getByText('line 2')).toBeDefined();

    const bulb = screen.getByTitle('View AI Proposal');
    fireEvent.click(bulb);
    expect(screen.getByText('Use let')).toBeInTheDocument();

    fireEvent.click(screen.getByText('[破棄 (Discard)]'));
    expect(onDiscard).toHaveBeenCalledWith('123');
    expect(screen.queryByText('Use let')).not.toBeInTheDocument();
  });

  it('renders ProposalPopup diff texts and buttons', () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    render(<ProposalPopup intervention={dummyIntervention} onApply={onApply} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByText('[反映 (Accept)]'));
    expect(onApply).toHaveBeenCalledWith(dummyIntervention);

    fireEvent.click(screen.getByText('[破棄 (Discard)]'));
    expect(onDiscard).toHaveBeenCalledWith('123');
  });
});


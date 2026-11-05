import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { MirrorEditor } from './components/MirrorEditor';
import { ProposalPopup } from './components/ProposalPopup';
import type { WebviewIntervention } from './types';
import { mockPostMessage } from './test/setup';

describe('App Component', () => {
  it('shows waiting message initially in code tab and sends ready message', () => {
    render(<App />);
    expect(screen.getByText('Waiting for document sync...')).toBeDefined();
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'ready' });
  });

  it('syncs document and interventions via IPC and handles apply and discard actions', () => {
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

    // 採用ボタンのクリック検証
    const acceptBtn = screen.getByTestId('diff-accept-btn');
    expect(acceptBtn).toHaveTextContent('[採用]');
    fireEvent.click(acceptBtn);

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'apply_intervention',
      id: 'int-1',
      newText: 'function',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
    });

    // 破棄ボタンのクリック検証 (Test Auditor指摘5)
    const discardBtn = screen.getByTestId('diff-discard-btn');
    expect(discardBtn).toHaveTextContent('[破棄]');
    fireEvent.click(discardBtn);

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'discard_intervention',
      id: 'int-1',
    });
  });

  it('does not render destroyed tabs (Learning, Dashboard, AI Inference Debug) in TabBar', () => {
    render(<App />);
    // 破壊された3タブの非存在検証 (RULE-005)
    expect(screen.queryByText('[🎓 学習支援]')).toBeNull();
    expect(screen.queryByText('[📊 Dashboard]')).toBeNull();
    expect(screen.queryByText('[🐞 AI推論デバッグ]')).toBeNull();

    // 存続している2タブの存在確認
    expect(screen.getByText('[💻 Code]')).toBeInTheDocument();
    expect(screen.getByText('[⚙️ Settings]')).toBeInTheDocument();
  });

  it('safely handles destroyed tab IPC messages (SYNC_SESSION_STATE, LLM_DASHBOARD_INIT, etc.) without crashing', () => {
    render(<App />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SYNC_SESSION_STATE',
            payload: { status: 'loading' },
          },
        })
      );
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
    });

    // クラッシュせず、Codeタブの内容が維持されること
    expect(screen.getByText('Waiting for document sync...')).toBeInTheDocument();
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

  it('switches to SettingsPanel upon receiving NAVIGATE_TO_SETTINGS message', () => {
    render(<App />);
    expect(screen.getByText('Waiting for document sync...')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'NAVIGATE_TO_SETTINGS',
          },
        })
      );
    });

    expect(screen.getByText('設定カテゴリ:')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter API Key')).toBeInTheDocument();
  });

  it('clears onDemandDetail and switches to SettingsPanel upon receiving NAVIGATE_TO_SETTINGS during on-demand view', () => {
    render(<App />);
    // オンデマンド詳細を展開
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'EXPAND_INTERVENTION_DETAIL',
            payload: {
              interventionId: 'int-on-demand',
              persona: 'concise',
              detail: {
                id: 'int-on-demand',
                title: 'On Demand Refactoring',
                summary: 'Refactor something',
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                status: 'pending',
                personaId: 'concise',
                originalCode: 'const a = 1;',
                proposedCode: 'const a = 2;',
                createdAt: '2026-11-05T00:00:00Z',
                updatedAt: '2026-11-05T00:00:00Z',
                chatHistory: [],
              },
            },
          },
        })
      );
    });

    // オンデマンドパネルが表示されていることを確認
    expect(screen.getByText('On Demand Refactoring')).toBeInTheDocument();

    // NAVIGATE_TO_SETTINGS を受信
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'NAVIGATE_TO_SETTINGS',
          },
        })
      );
    });

    // オンデマンドパネルが閉じ、SettingsPanel が表示されること
    expect(screen.queryByText('On Demand Refactoring')).toBeNull();
    expect(screen.getByText('設定カテゴリ:')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter API Key')).toBeInTheDocument();
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

  it('renders text with line numbers and handles diff discard inline', () => {
    const onDiscard = vi.fn();
    render(
      <MirrorEditor
        text={'const x = 1;\r\nline 2'}
        interventions={[dummyIntervention]}
        onApply={vi.fn()}
        onDiscard={onDiscard}
      />
    );
    expect(screen.getByText('line 2')).toBeDefined();

    const discardBtn = screen.getByTestId('diff-discard-btn');
    expect(discardBtn).toHaveTextContent('[破棄]');
    fireEvent.click(discardBtn);
    expect(onDiscard).toHaveBeenCalledWith('123');
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

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';
import { mockPostMessage } from './test/setup';

describe('App Component (Webview UI)', () => {
  it('初期描画時にGET_SETTINGSを送信し、主要UI要素を表示すること', () => {
    render(<App />);

    // 起動時にGET_SETTINGSがVS Codeへ送信されること
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'GET_SETTINGS' });

    // ヘッダーが表示されること
    expect(screen.getByText('✨ vibeCodeEase')).toBeInTheDocument();

    // プリセットカードが表示されること
    expect(screen.getByText(/学習モード/)).toBeInTheDocument();
    expect(screen.getByText(/フローモード/)).toBeInTheDocument();
    expect(screen.getByText(/職人モード/)).toBeInTheDocument();
    expect(screen.getByText(/カスタム調整/)).toBeInTheDocument();

    // スライダー項目が表示されること
    expect(screen.getByText('タイポ・誤記')).toBeInTheDocument();
    expect(screen.getByText('インデント・整形')).toBeInTheDocument();

    // AIモデル・API設定セクションが表示されること
    expect(screen.getByText('🤖 AIモデル & API設定')).toBeInTheDocument();
    expect(screen.getByText('LLM プロバイダー')).toBeInTheDocument();
  });

  it('プリセットカードをクリックすると SET_PRESET メッセージが送信されること', () => {
    render(<App />);

    const flowCard = screen.getByText(/フローモード/).closest('.preset-card');
    expect(flowCard).not.toBeNull();

    fireEvent.click(flowCard!);

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'SET_PRESET',
      payload: 'FLOW'
    });
  });

  it('スライダーの値を変更すると UPDATE_PREFERENCE_VALUE が送信されること', () => {
    render(<App />);

    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThan(0);

    const typoSlider = sliders[0];
    fireEvent.change(typoSlider, { target: { value: '0.95' } });

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'UPDATE_PREFERENCE_VALUE',
      payload: {
        category: 'SYNTAX_TYPO',
        value: 0.95
      }
    });
  });

  it('LLMプロバイダーを変更すると SET_LLM_CONFIG が送信されること', () => {
    render(<App />);
    const providerSelect = screen.getByDisplayValue(/Google Gemini/);
    fireEvent.change(providerSelect, { target: { value: 'vscode-lm' } });

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'SET_LLM_CONFIG',
      payload: { provider: 'vscode-lm', model: 'auto' }
    });
  });

  it('APIキーを入力して保存すると SAVE_API_KEY が送信されること', () => {
    render(<App />);
    const apiKeyInput = screen.getByPlaceholderText('AIza...');
    fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } });
    
    const saveButton = screen.getByRole('button', { name: '保存' });
    fireEvent.click(saveButton);

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'SAVE_API_KEY',
      payload: { apiKey: 'test-api-key' }
    });
  });

  it('解析ボタンをクリックすると ANALYZE_CURRENT_FILE が送信されること', () => {
    render(<App />);

    const analyzeButton = screen.getByRole('button', { name: /現在のファイルを解析/ });
    fireEvent.click(analyzeButton);

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'ANALYZE_CURRENT_FILE'
    });
  });

  it('プランを受信したときにプラン詳細が表示され、承認・却下できること', async () => {
    render(<App />);

    // 拡張機能からの INTERVENTION_PLAN メッセージをシミュレート
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'INTERVENTION_PLAN',
            payload: {
              summary: 'タイポを1件修正します',
              edits: [
                {
                  startLine: 0,
                  startCharacter: 0,
                  endLine: 0,
                  endCharacter: 7,
                  newText: 'function',
                  category: 'SYNTAX_TYPO',
                  reason: 'functon の誤記'
                }
              ]
            }
          }
        })
      );
    });

    // プラン内容が表示されること
    expect(await screen.findByText('📋 介入プラン')).toBeInTheDocument();
    expect(screen.getByText('タイポを1件修正します')).toBeInTheDocument();
    expect(screen.getByText(/functon の誤記/)).toBeInTheDocument();

    // 「承認して適用」ボタンをクリック
    const applyButton = screen.getByRole('button', { name: '承認して適用' });
    fireEvent.click(applyButton);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'APPLY_PLAN' });

    // 「却下」ボタンをクリック
    const rejectButton = screen.getByRole('button', { name: '却下' });
    fireEvent.click(rejectButton);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'REJECT_PLAN' });
  });
});

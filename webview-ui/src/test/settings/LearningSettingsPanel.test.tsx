import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningSettingsPanel } from '../../components/settings/LearningSettingsPanel';
import type { LearningSettingsExtensionMessage, UserLearningConfig } from '../../types';

describe('LearningSettingsPanel Component Tests', () => {
  let postMessageMock: Mock<(msg: unknown) => void>;
  let mockVscode: { postMessage: (msg: unknown) => void };

  const defaultConfig: UserLearningConfig = {
    intervalSeconds: 30,
    debounceMs: 5000,
    stagnationThresholdN: 3,
    progressDeltaThreshold: 5,
    snoozeMinutes: 3,
    defaultDisclosureMode: 'stepByStep',
    pauseExistingAnalysisDuringLearning: true,
  };

  beforeEach(() => {
    postMessageMock = vi.fn<(msg: unknown) => void>();
    mockVscode = { postMessage: postMessageMock };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sendExtensionMessage = (msg: LearningSettingsExtensionMessage) => {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: msg }));
    });
  };

  it('マウント直後はEmpty状態（スケルトン表示）であり、REQUEST_LEARNING_CONFIGを送信すること', () => {
    render(<LearningSettingsPanel vscode={mockVscode} />);

    expect(screen.getByText(/学習支援設定を読み込んでいます/i)).toBeInTheDocument();
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'REQUEST_LEARNING_CONFIG' });
  });

  it('SYNC_LEARNING_CONFIG受信後に全設定値（ラジオボタン含む）が正しく描画されること', () => {
    render(<LearningSettingsPanel vscode={mockVscode} />);
    sendExtensionMessage({ type: 'SYNC_LEARNING_CONFIG', payload: defaultConfig });

    expect((screen.getByLabelText(/AI完成形予想の生成間隔/i) as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText(/コード変更検知後のデバウンス/i) as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText(/停滞とみなす連続生成回数/i) as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText(/進捗停滞と判定する変化率/i) as HTMLInputElement).value).toBe('5');

    // ラジオボタンの初期選択確認
    const snooze3 = screen.getByRole('radio', { name: /3分/i }) as HTMLInputElement;
    expect(snooze3.checked).toBe(true);

    const stepMode = screen.getByRole('radio', { name: /少しずつ段階的に開示/i }) as HTMLInputElement;
    expect(stepMode.checked).toBe(true);

    const pauseCheckbox = screen.getByLabelText(/学習セッション中は既存の「自動推敲」を自動停止する/i) as HTMLInputElement;
    expect(pauseCheckbox.checked).toBe(true);
  });

  it('境界値外の入力を行った場合に各フィールドで赤枠警告が表示され、保存ボタンが無効化されること', () => {
    render(<LearningSettingsPanel vscode={mockVscode} />);
    sendExtensionMessage({ type: 'SYNC_LEARNING_CONFIG', payload: defaultConfig });

    const intervalInput = screen.getByLabelText(/AI完成形予想の生成間隔/i);
    const saveButton = screen.getByRole('button', { name: /設定を保存する/i });

    // 1. 生成間隔の上限超過 (301)
    fireEvent.change(intervalInput, { target: { value: '301' } });
    expect(screen.getByText(/10秒〜300秒の範囲で指定してください/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/入力内容にエラーがあります/i)).toBeInTheDocument();

    // 正常値に戻す
    fireEvent.change(intervalInput, { target: { value: '30' } });
    expect(saveButton).not.toBeDisabled();

    // 2. デバウンスの下限 (1) と上限超過 (16)
    const debounceInput = screen.getByLabelText(/コード変更検知後のデバウンス/i);
    fireEvent.change(debounceInput, { target: { value: '1' } });
    expect(screen.getByText(/2秒〜15秒の範囲で指定してください/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.change(debounceInput, { target: { value: '16' } });
    expect(screen.getByText(/2秒〜15秒の範囲で指定してください/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.change(debounceInput, { target: { value: '5' } });

    // 3. 停滞判定回数の下限 (1) と上限 (11)
    const thresholdInput = screen.getByLabelText(/停滞とみなす連続生成回数/i);
    fireEvent.change(thresholdInput, { target: { value: '1' } });
    expect(screen.getByText(/2回〜10回の範囲で指定してください/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.change(thresholdInput, { target: { value: '11' } });
    expect(screen.getByText(/2回〜10回の範囲で指定してください/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.change(thresholdInput, { target: { value: '3' } });

    // 4. 変化率閾値の下限 (0) と上限 (21)
    const deltaInput = screen.getByLabelText(/進捗停滞と判定する変化率/i);
    fireEvent.change(deltaInput, { target: { value: '0' } });
    expect(screen.getByText(/1%〜20%の範囲で指定してください/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.change(deltaInput, { target: { value: '21' } });
    expect(screen.getByText(/1%〜20%の範囲で指定してください/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it('Loading状態: 保存ボタン押下直後にボタンがdisabledになり、保存中メッセージが表示されること', () => {
    render(<LearningSettingsPanel vscode={mockVscode} />);
    sendExtensionMessage({ type: 'SYNC_LEARNING_CONFIG', payload: defaultConfig });

    const saveButton = screen.getByRole('button', { name: /設定を保存する/i });
    const resetButton = screen.getByRole('button', { name: /デフォルト設定に戻す/i });

    fireEvent.click(saveButton);

    // Loading 状態のアサート
    expect(saveButton).toBeDisabled();
    expect(resetButton).toBeDisabled();
    expect(screen.getByText(/設定をストレージに書き込んでいます/i)).toBeInTheDocument();
  });

  it('設定変更後に保存ボタンを押下すると全変更ペイロードが送信されること', () => {
    render(<LearningSettingsPanel vscode={mockVscode} />);
    sendExtensionMessage({ type: 'SYNC_LEARNING_CONFIG', payload: defaultConfig });

    fireEvent.change(screen.getByLabelText(/AI完成形予想の生成間隔/i), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText(/コード変更検知後のデバウンス/i), { target: { value: '6' } });

    // スヌーズ5分、一括開示、推敲停止OFFに変更
    fireEvent.click(screen.getByRole('radio', { name: /5分/i }));
    fireEvent.click(screen.getByRole('radio', { name: /一気に全開示/i }));
    fireEvent.click(screen.getByLabelText(/学習セッション中は既存の「自動推敲」を自動停止する/i));

    fireEvent.click(screen.getByRole('button', { name: /設定を保存する/i }));

    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'UPDATE_LEARNING_CONFIG',
      payload: expect.objectContaining({
        intervalSeconds: 45,
        debounceMs: 6000,
        snoozeMinutes: 5,
        defaultDisclosureMode: 'direct',
        pauseExistingAnalysisDuringLearning: false,
      }),
    });
  });

  it('デフォルト設定に戻すボタン押下でRESET_LEARNING_CONFIGが送信されること', () => {
    render(<LearningSettingsPanel vscode={mockVscode} />);
    sendExtensionMessage({ type: 'SYNC_LEARNING_CONFIG', payload: defaultConfig });

    fireEvent.click(screen.getByRole('button', { name: /デフォルト設定に戻す/i }));
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'RESET_LEARNING_CONFIG' });
  });

  it('NOTIFY_CONFIG_SAVED 失敗時にエラーメッセージが表示されること', () => {
    render(<LearningSettingsPanel vscode={mockVscode} />);
    sendExtensionMessage({ type: 'SYNC_LEARNING_CONFIG', payload: defaultConfig });

    sendExtensionMessage({
      type: 'NOTIFY_CONFIG_SAVED',
      payload: { success: false, message: '生成間隔は10秒〜300秒の範囲で指定してください' },
    });

    expect(screen.getByText(/生成間隔は10秒〜300秒の範囲で指定してください/i)).toBeInTheDocument();
  });

  it('NOTIFY_CONFIG_SAVED 成功時にトーストが表示され、3000ms後に通常メッセージへ自動復帰すること', () => {
    vi.useFakeTimers();
    render(<LearningSettingsPanel vscode={mockVscode} />);
    sendExtensionMessage({ type: 'SYNC_LEARNING_CONFIG', payload: defaultConfig });

    sendExtensionMessage({
      type: 'NOTIFY_CONFIG_SAVED',
      payload: { success: true, message: '設定を保存しました' },
    });

    expect(screen.getByText(/設定を保存しました/i)).toBeInTheDocument();

    // 3000ms経過
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/設定は保存されています/i)).toBeInTheDocument();
  });
});

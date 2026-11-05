/**
 * [Why/Intent] LlmGeneralSettingsSection コンポーネントの単体テスト。
 * 一元化されたGemini推奨モデル群（6モデル、詳細仕様書3.1準拠ラベル）が正しくドロップダウンに描画され、
 * 旧式モデルの非存在（RULE-005 Negative Assertion）、およびモデル変更・APIキー更新・即時解析などの
 * ユーザー操作が正しくIPCメッセージおよびコールバックへ伝搬されることを検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmGeneralSettingsSection } from '../../components/settings/LlmGeneralSettingsSection';
import { vscode } from '../../utils/vscode';

vi.mock('../../utils/vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
  },
}));

describe('LlmGeneralSettingsSection Component Tests', () => {
  const onUpdateApiKey = vi.fn();
  const onUpdateLevel = vi.fn();
  const onForceAnalyze = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * [Why/Intent] 詳細仕様書 3.1 に準拠した6つのGemini推奨モデル表示ラベルおよびvalue属性が正しく描画され、
   * かつ廃止された旧モデルが存在しないこと（RULE-005 Negative Assertion）を検証する
   */
  it('サポート対象のGeminiモデル群（6モデル）が仕様書通りのラベルとvalueで描画され、旧モデルが存在しないこと', () => {
    render(
      <LlmGeneralSettingsSection
        hasApiKey={true}
        apiKeyLength={20}
        aiInterventionLevel="Level 2 (Refactoring)"
        frequency="onSave"
        intervalSeconds={10}
        model="gemini-3.5-flash-lite"
        onUpdateApiKey={onUpdateApiKey}
        onUpdateLevel={onUpdateLevel}
        onForceAnalyze={onForceAnalyze}
      />
    );

    const selects = screen.getAllByRole('combobox');
    const modelSelect = selects[1];
    expect(modelSelect).toBeInTheDocument();

    // 詳細仕様書 3.1 に規定された推奨モデル一覧と推奨表示ラベル
    const expectedModelOptions = [
      { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (デフォルト・推奨・高速)' },
      { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (最新・高品質)' },
      { value: 'gemini-3.6-flash', label: 'gemini-3.6-flash' },
      { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite' },
      { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
    ];

    for (const item of expectedModelOptions) {
      const opt = screen.getByRole('option', { name: item.label });
      expect(opt).toBeInTheDocument();
      expect(opt).toHaveValue(item.value);
    }

    // 【RULE-005: 削除対象の旧要素の非存在アサーション】
    const deprecatedModels = [
      'gemini-3.8-live',
      'gemini-3.8-live-extended-thinking',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ];
    for (const deprecated of deprecatedModels) {
      expect(screen.queryAllByRole('option', { name: new RegExp(`^${deprecated}`) })).toHaveLength(0);
    }
  });

  /**
   * [Why/Intent] モデルセレクトボックスの変更時に、vscode.postMessage 経由で設定更新が送信されることを検証する
   */
  it('モデル変更時に update_llm_config メッセージが送信されること', () => {
    render(
      <LlmGeneralSettingsSection
        hasApiKey={true}
        apiKeyLength={20}
        aiInterventionLevel="Level 2 (Refactoring)"
        frequency="onSave"
        intervalSeconds={10}
        model="gemini-3.5-flash-lite"
        onUpdateApiKey={onUpdateApiKey}
        onUpdateLevel={onUpdateLevel}
        onForceAnalyze={onForceAnalyze}
      />
    );

    const selects = screen.getAllByRole('combobox');
    const modelSelect = selects[1];
    fireEvent.change(modelSelect, { target: { value: 'gemini-3.8-flash' } });

    expect(vscode.postMessage).toHaveBeenCalledWith({
      command: 'update_llm_config',
      frequency: 'onSave',
      intervalSeconds: 10,
      model: 'gemini-3.8-flash',
    });
  });

  /**
   * [Why/Intent] 「今すぐコードを推敲する」ボタン押下時に onForceAnalyze コールバックが発火することを検証する
   */
  it('「今すぐコードを推敲する」ボタン押下時に onForceAnalyze が呼ばれること', () => {
    render(
      <LlmGeneralSettingsSection
        hasApiKey={true}
        aiInterventionLevel="Level 2 (Refactoring)"
        frequency="onSave"
        intervalSeconds={10}
        model="gemini-3.5-flash-lite"
        onUpdateApiKey={onUpdateApiKey}
        onUpdateLevel={onUpdateLevel}
        onForceAnalyze={onForceAnalyze}
      />
    );

    const analyzeBtn = screen.getByRole('button', { name: /今すぐコードを推敲する/i });
    fireEvent.click(analyzeBtn);

    expect(onForceAnalyze).toHaveBeenCalledTimes(1);
  });
});

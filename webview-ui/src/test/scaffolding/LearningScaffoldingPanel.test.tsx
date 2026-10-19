import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LearningScaffoldingPanel } from '../../components/LearningScaffoldingPanel';
import type { LearningExtensionMessage, LearningSessionState } from '../../types';

describe('LearningScaffoldingPanel Component Tests', () => {
  const mockPostMessage = vi.fn();
  const mockVscode = { postMessage: mockPostMessage };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sendExtensionMessage = (msg: LearningExtensionMessage) => {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: msg }));
    });
  };

  it('初期状態ではEmpty画面が描画され、入力後にSTART_SESSIONを送信すること', () => {
    render(<LearningScaffoldingPanel vscode={mockVscode} isActive={true} />);

    expect(screen.getByText('🎯 学習セッションの開始')).toBeInTheDocument();
    const taskInput = screen.getByPlaceholderText(/例: Reactでカスタムフック/);
    const goalInput = screen.getByPlaceholderText(/例: useEffectのクリーンアップ/);
    const startBtn = screen.getByRole('button', { name: /見守り学習を開始する/ });

    fireEvent.change(taskInput, { target: { value: 'カウンター作成' } });
    fireEvent.change(goalInput, { target: { value: 'useEffect理解' } });
    fireEvent.click(startBtn);

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'START_SESSION',
      payload: { taskDescription: 'カウンター作成', learningGoal: 'useEffect理解' },
    });
  });

  it('Loading状態では準備中メッセージが表示され、セッション終了ボタンでSTOP_SESSIONを送信すること', () => {
    render(<LearningScaffoldingPanel vscode={mockVscode} isActive={true} />);

    const loadingState: LearningSessionState = {
      taskId: '123',
      taskDescription: 'カウンター作成',
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

    sendExtensionMessage({ type: 'SYNC_SESSION_STATE', payload: loadingState });

    expect(screen.getByText(/AIがあなたのコードから完成形の予想図を準備しています/)).toBeInTheDocument();
    const stopBtn = screen.getByRole('button', { name: /セッション終了/ });
    fireEvent.click(stopBtn);

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'STOP_SESSION' });
  });

  it('Success状態かつ停滞検知時にバナーが表示され、ヒント・スヌーズ・今日は不要が送信されること', () => {
    render(<LearningScaffoldingPanel vscode={mockVscode} isActive={true} />);

    const successState: LearningSessionState = {
      taskId: '123',
      taskDescription: 'カウンター作成',
      learningGoal: 'useEffect理解',
      status: 'success',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: {
        milestones: [{ id: '1', title: 'Task 1', weight: 100, status: 'IN_PROGRESS', isLearningGoalCore: true }],
        predictedCompleteCode: 'const x = 1;',
        unresolvedKeyTasks: ['クリーンアップ'],
        stagnationReasonHint: 'タイマー解除なし',
        scaffoldingLevels: {
          level1Perspective: 'タイマーは解除されていますか？',
          level2Concept: 'useEffectの戻り値で関数を返します。',
          level3SkeletonCode: 'return () => {};',
          level4CompleteDiff: 'return () => clearInterval(id);',
        },
        diagnosticPenalty: 0,
        estimatedProgress: 50,
        timestamp: Date.now(),
        codeHash: 'hash-abc',
      },
      assessment: { isStagnated: true, consecutiveStagnantCount: 3, reason: 'NO_PROGRESS_SCORE', confidence: 0.9 },
      snoozeUntilTimestamp: null,
      isDismissed: false,
      lastUpdatedTimestamp: Date.now(),
      history: [],
    };

    sendExtensionMessage({ type: 'SYNC_SESSION_STATE', payload: successState });
    expect(screen.getByText(/少し手が止まっているようです/)).toBeInTheDocument();

    // 1. 自力で続ける (3分延長)
    const snoozeBtn = screen.getByRole('button', { name: /自力で続ける/ });
    fireEvent.click(snoozeBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SNOOZE_HINT', payload: { snoozeMinutes: 3 } });

    // 2. 今日は不要
    const dismissBtn = screen.getByRole('button', { name: /今日は不要/ });
    fireEvent.click(dismissBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'DISMISS_HINT' });

    // 3. ヒントを見る
    const hintBtn = screen.getByRole('button', { name: /ヒントを見る/ });
    fireEvent.click(hintBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'REQUEST_HINT' });
  });

  it('stepByStepモードでLv1表示時は差分ロック、Lv3になると差分が展開され差分適用が可能になること', () => {
    render(<LearningScaffoldingPanel vscode={mockVscode} isActive={true} />);

    const basePrediction = {
      milestones: [],
      predictedCompleteCode: 'const x = 1;',
      unresolvedKeyTasks: [],
      stagnationReasonHint: '',
      scaffoldingLevels: {
        level1Perspective: '観点ヒント本文',
        level2Concept: '概念ヒント本文',
        level3SkeletonCode: '骨組みコード本文',
        level4CompleteDiff: '完成差分本文',
      },
      diagnosticPenalty: 0,
      estimatedProgress: 30,
      timestamp: Date.now(),
      codeHash: 'hash',
    };

    // 1. Lv1状態の受信
    const stateLv1: LearningSessionState = {
      taskId: '123',
      taskDescription: 'タスク',
      learningGoal: '目標',
      status: 'success',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: basePrediction,
      assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
      snoozeUntilTimestamp: null,
      isDismissed: false,
      lastUpdatedTimestamp: Date.now(),
      history: [],
    };
    sendExtensionMessage({ type: 'SYNC_SESSION_STATE', payload: stateLv1 });

    expect(screen.getByText('観点ヒント本文')).toBeInTheDocument();
    expect(screen.getByText(/差分プレビュー \(コードのネタバレを防ぐため非表示\)/)).toBeInTheDocument();

    // 次のヒントを開示するボタン押下
    const nextBtn = screen.getByRole('button', { name: /次のヒントを開示する/ });
    fireEvent.click(nextBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'UNLOCK_NEXT_HINT_LEVEL', payload: { targetLevel: 2 } });

    // 2. Lv3状態を受信 -> ロックが解除され差分プレビューと適用ボタンが表示されること
    const stateLv3: LearningSessionState = {
      ...stateLv1,
      unlockedLevel: 3,
    };
    sendExtensionMessage({ type: 'SYNC_SESSION_STATE', payload: stateLv3 });

    expect(screen.queryByText(/差分プレビュー \(コードのネタバレを防ぐため非表示\)/)).not.toBeInTheDocument();
    expect(screen.getByText('骨組みコード本文')).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: /差分を適用する/ });
    fireEvent.click(applyBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'APPLY_DIFF',
      payload: { replacementCode: '骨組みコード本文' },
    });
  });

  it('directモード切替や一括開示ボタン押下で全レベルが開示され、Diffが展開されること', () => {
    render(<LearningScaffoldingPanel vscode={mockVscode} isActive={true} />);

    const state: LearningSessionState = {
      taskId: '123',
      taskDescription: 'タスク',
      learningGoal: '目標',
      status: 'success',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: {
        milestones: [],
        predictedCompleteCode: 'completedCode',
        unresolvedKeyTasks: [],
        stagnationReasonHint: '',
        scaffoldingLevels: {
          level1Perspective: 'P',
          level2Concept: 'C',
          level3SkeletonCode: 'S',
          level4CompleteDiff: 'D',
        },
        diagnosticPenalty: 0,
        estimatedProgress: 30,
        timestamp: Date.now(),
        codeHash: 'hash',
      },
      assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
      snoozeUntilTimestamp: null,
      isDismissed: false,
      lastUpdatedTimestamp: Date.now(),
      history: [],
    };
    sendExtensionMessage({ type: 'SYNC_SESSION_STATE', payload: state });

    // 一括開示ボタン押下
    const unlockAllBtn = screen.getByRole('button', { name: /すぐに完成形と差分を見る/ });
    fireEvent.click(unlockAllBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'UNLOCK_ALL_HINTS' });

    // directモード切替
    const directRadio = screen.getByRole('radio', { name: /一気に全開示/ });
    fireEvent.click(directRadio);
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'SET_DISCLOSURE_MODE',
      payload: { mode: 'direct' },
    });
  });

  it('Error状態ではエラーメッセージが表示され、再試行が可能であること', () => {
    render(<LearningScaffoldingPanel vscode={mockVscode} isActive={true} />);

    const errorState: LearningSessionState = {
      taskId: '123',
      taskDescription: 'タスク',
      learningGoal: '目標',
      status: 'error',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: null,
      assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
      snoozeUntilTimestamp: null,
      isDismissed: false,
      lastUpdatedTimestamp: Date.now(),
      history: [],
      errorMessage: 'API Key is missing',
      errorCode: 'AUTH_MISSING',
    };
    sendExtensionMessage({ type: 'SYNC_SESSION_STATE', payload: errorState });

    expect(screen.getByText(/AI見守りサービス エラー/)).toBeInTheDocument();
    expect(screen.getByText(/API Key is missing/)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /再試行/ });
    fireEvent.click(retryBtn);
    // 再試行でSTART_SESSIONを再送
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'START_SESSION',
      payload: { taskDescription: 'タスク', learningGoal: '目標' },
    });
  });

  it('Success状態からセッション終了ボタンを押下した際にSTOP_SESSIONが送信されること', () => {
    render(<LearningScaffoldingPanel vscode={mockVscode} isActive={true} />);

    const state: LearningSessionState = {
      taskId: '123',
      taskDescription: 'タスク',
      learningGoal: '目標',
      status: 'success',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: null,
      assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
      snoozeUntilTimestamp: null,
      isDismissed: false,
      lastUpdatedTimestamp: Date.now(),
      history: [],
    };
    sendExtensionMessage({ type: 'SYNC_SESSION_STATE', payload: state });

    const stopBtn = screen.getByRole('button', { name: /セッション終了/ });
    fireEvent.click(stopBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'STOP_SESSION' });
  });
});

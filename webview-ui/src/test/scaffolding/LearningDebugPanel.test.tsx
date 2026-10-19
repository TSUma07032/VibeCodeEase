import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LearningDebugPanel } from '../../components/scaffolding/LearningDebugPanel';
import type { LearningSessionState } from '../../types';

describe('LearningDebugPanel Component Tests', () => {
  const mockVscode = { postMessage: vi.fn() };

  it('stateがnullまたはemptyまたはlatestPredictionがnullのとき、プレースホルダーが表示されること', () => {
    // 1. stateがnull
    const { rerender } = render(<LearningDebugPanel state={null} vscode={mockVscode} />);
    expect(screen.getByText(/現在アクティブな学習セッション、またはAI推論結果が存在しません/)).toBeInTheDocument();

    // 2. statusがempty
    const emptyState: LearningSessionState = {
      taskId: '',
      taskDescription: '',
      learningGoal: '',
      status: 'empty',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: null,
      assessment: { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 },
      snoozeUntilTimestamp: null,
      isDismissed: false,
      lastUpdatedTimestamp: Date.now(),
      history: [],
    };
    rerender(<LearningDebugPanel state={emptyState} vscode={mockVscode} />);
    expect(screen.getByText(/現在アクティブな学習セッション、またはAI推論結果が存在しません/)).toBeInTheDocument();

    // 3. statusがloading (latestPredictionがnull)
    const loadingState: LearningSessionState = {
      ...emptyState,
      status: 'loading',
      taskDescription: 'タスク',
    };
    rerender(<LearningDebugPanel state={loadingState} vscode={mockVscode} />);
    expect(screen.getByText(/現在アクティブな学習セッション、またはAI推論結果が存在しません/)).toBeInTheDocument();
  });

  it('有効なstateが渡された際、進捗内訳・マイルストーン・停滞判定・減点・スヌーズ状態・完成コード・履歴が表示されること', () => {
    const state: LearningSessionState = {
      taskId: '123456',
      taskDescription: 'カウンターコンポーネント',
      learningGoal: 'useEffectのクリーンアップ',
      status: 'success',
      disclosureMode: 'stepByStep',
      unlockedLevel: 1,
      latestPrediction: {
        milestones: [
          { id: '1', title: 'stateフック定義', weight: 30, status: 'COMPLETED', isLearningGoalCore: false },
          { id: '2', title: 'クリーンアップ実装', weight: 70, status: 'IN_PROGRESS', isLearningGoalCore: true },
        ],
        predictedCompleteCode: 'export function CompleteCounter() { return 42; }',
        unresolvedKeyTasks: ['クリーンアップの記述'],
        stagnationReasonHint: 'タイマー解除が未完了',
        scaffoldingLevels: {
          level1Perspective: 'P',
          level2Concept: 'C',
          level3SkeletonCode: 'S',
          level4CompleteDiff: 'D',
        },
        diagnosticPenalty: 5,
        estimatedProgress: 60,
        timestamp: 1729000000000,
        codeHash: 'hash-1234',
      },
      assessment: {
        isStagnated: true,
        consecutiveStagnantCount: 3,
        reason: 'NO_PROGRESS_SCORE',
        confidence: 0.9,
      },
      snoozeUntilTimestamp: 1729000180000, // スヌーズ中
      isDismissed: false,
      lastUpdatedTimestamp: 1729000000000,
      history: [
        {
          timestamp: 1729000000000,
          estimatedProgress: 60,
          codeHash: 'hash-1234',
          unresolvedTasks: ['クリーンアップの記述'],
          diagnosticsCount: 1,
        },
      ],
    };

    render(<LearningDebugPanel state={state} vscode={mockVscode} />);

    // 進捗率と減点内訳の表示検証
    expect(screen.getByText(/推定進捗度/)).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument();
    expect(screen.getByText(/エラー減点: 5%/)).toBeInTheDocument();

    // マイルストーン表示検証
    expect(screen.getByText(/stateフック定義/)).toBeInTheDocument();
    expect(screen.getByText(/クリーンアップ実装/)).toBeInTheDocument();

    // 停滞判定とスヌーズ状態表示検証
    expect(screen.getByText(/NO_PROGRESS_SCORE/)).toBeInTheDocument();
    expect(screen.getByText(/スヌーズ中/)).toBeInTheDocument();

    // AI予想完成形コードの表示検証
    expect(screen.getByText(/export function CompleteCounter\(\) \{ return 42; \}/)).toBeInTheDocument();

    // 履歴スナップショット表示検証
    expect(screen.getByText(/hash-1234/)).toBeInTheDocument();
  });
});

/**
 * [Why/Intent] 学習支援サブシステムのメインパネル。4状態（Empty, Loading, Error, Success）を制御・描画する。
 */
import React, { useEffect, useState } from 'react';
import type { LearningExtensionMessage, LearningSessionState } from '../types';
import { DiffPreviewArea } from './scaffolding/DiffPreviewArea';
import { EmptyStateView } from './scaffolding/EmptyStateView';
import { ErrorStateView } from './scaffolding/ErrorStateView';
import { LoadingStateView } from './scaffolding/LoadingStateView';
import { ProgressiveHintCard } from './scaffolding/ProgressiveHintCard';
import { SessionHeader } from './scaffolding/SessionHeader';
import { StagnationAlertBanner } from './scaffolding/StagnationAlertBanner';

/**
 * [Why/Intent] App.tsx から LearningScaffoldingPanel へ渡されるPropsインターフェース。
 * VS Code通信ラッパーおよびアクティブ表示状態を受け取る。
 */
export interface LearningScaffoldingPanelProps {
  /** [Why/Intent] Extension側とのIPC通信オブジェクト */
  vscode: { postMessage: (msg: unknown) => void };
  /** [Why/Intent] 本パネルが現在アクティブタブとして表示中かどうかのフラグ */
  isActive: boolean;
  /** [Why/Intent] タブ切り替え後もセッション状態を維持するための初期状態 */
  initialState?: LearningSessionState | null;
}

/**
 * [Why/Intent] 学習支援の4状態レンダリングとWebview IPC購読を行うメインコンポーネント。
 */
export const LearningScaffoldingPanel: React.FC<LearningScaffoldingPanelProps> = ({ vscode, initialState = null }) => {
  const [ipcState, setIpcState] = useState<LearningSessionState | null>(null);
  const state = ipcState ?? initialState;

  useEffect(() => {
    const handleMessage = (event: MessageEvent<LearningExtensionMessage>) => {
      const data = event.data;
      if (data && data.type === 'SYNC_SESSION_STATE') {
        setIpcState(data.payload);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!state || state.status === 'empty') {
    return (
      <EmptyStateView
        onStartSession={(taskDescription, learningGoal) =>
          vscode.postMessage({ type: 'START_SESSION', payload: { taskDescription, learningGoal } })
        }
      />
    );
  }

  if (state.status === 'loading') {
    return <LoadingStateView onStopSession={() => vscode.postMessage({ type: 'STOP_SESSION' })} />;
  }

  if (state.status === 'error') {
    const payload = { taskDescription: state.taskDescription, learningGoal: state.learningGoal };
    return <ErrorStateView errorMessage={state.errorMessage} onRetry={() => vscode.postMessage({ type: 'START_SESSION', payload })} />;
  }

  const { taskDescription, learningGoal, latestPrediction, unlockedLevel, disclosureMode, assessment } = state;
  return (
    <div data-testid="learning-scaffolding-panel" style={{ height: '100%', overflowY: 'auto' }}>
      <SessionHeader
        taskDescription={taskDescription} learningGoal={learningGoal}
        progress={latestPrediction?.estimatedProgress ?? 0} milestones={latestPrediction?.milestones}
        onStopSession={() => vscode.postMessage({ type: 'STOP_SESSION' })}
      />
      {assessment.isStagnated && (
        <StagnationAlertBanner
          onRequestHint={() => vscode.postMessage({ type: 'REQUEST_HINT' })}
          onSnooze={(snoozeMinutes) => vscode.postMessage({ type: 'SNOOZE_HINT', payload: { snoozeMinutes } })}
          onDismiss={() => vscode.postMessage({ type: 'DISMISS_HINT' })}
        />
      )}
      {latestPrediction && (
        <>
          <ProgressiveHintCard
            levels={latestPrediction.scaffoldingLevels} unlockedLevel={unlockedLevel} disclosureMode={disclosureMode}
            onSetMode={(mode) => vscode.postMessage({ type: 'SET_DISCLOSURE_MODE', payload: { mode } })}
            onUnlockNext={(targetLevel) => vscode.postMessage({ type: 'UNLOCK_NEXT_HINT_LEVEL', payload: { targetLevel } })}
            onUnlockAll={() => vscode.postMessage({ type: 'UNLOCK_ALL_HINTS' })}
          />
          <DiffPreviewArea
            levels={latestPrediction.scaffoldingLevels} unlockedLevel={unlockedLevel} disclosureMode={disclosureMode}
            onApplyDiff={(replacementCode) => vscode.postMessage({ type: 'APPLY_DIFF', payload: { replacementCode } })}
          />
        </>
      )}
    </div>
  );
};

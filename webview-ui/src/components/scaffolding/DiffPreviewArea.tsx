/**
 * [Why/Intent] 学習者のネタバレを防ぎつつ、Lv3以降または直接開示時に差分プレビューと適用ボタンを提供する。
 */
import React from 'react';
import type { ScaffoldingLevels } from '../../types';

/**
 * [Why/Intent] 親コンポーネント LearningScaffoldingPanel から授受されるProps定義。
 * 4段階ヒント内容、アンロック済みレベル、開示モード、および差分適用コールバックを受け取る。
 */
interface DiffPreviewAreaProps {
  /** [Why/Intent] Lv1〜Lv4のヒント文字列群 */
  levels: ScaffoldingLevels;
  /** [Why/Intent] 現在アンロックされている最大ヒントレベル(1〜4) */
  unlockedLevel: 1 | 2 | 3 | 4;
  /** [Why/Intent] 段階的開示か直接開示かのモード */
  disclosureMode: 'stepByStep' | 'direct';
  /** [Why/Intent] 差分をエディタへ適用するコールバック */
  onApplyDiff: (replacementCode: string) => void;
}

/**
 * [Why/Intent] ネタバレ防止ロック状態とアンロック後の差分プレビュー・適用ボタンを描画する。
 */
export const DiffPreviewArea: React.FC<DiffPreviewAreaProps> = ({
  levels,
  unlockedLevel,
  disclosureMode,
  onApplyDiff,
}) => {
  const isLocked = unlockedLevel < 3 && disclosureMode === 'stepByStep';
  const replacementCode =
    unlockedLevel >= 4 || disclosureMode === 'direct'
      ? levels.level4CompleteDiff
      : levels.level3SkeletonCode;

  if (isLocked) {
    return (
      <div
        style={{
          margin: '16px',
          padding: '24px',
          border: '1px dashed var(--vscode-widget-border, #454545)',
          borderRadius: '4px',
          textAlign: 'center',
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        🔒 差分プレビュー (コードのネタバレを防ぐため非表示)
        <div style={{ fontSize: '11px', marginTop: '6px' }}>
          ヒントLv 3に進むか、一括開示を選択すると展開されます。
        </div>
      </div>
    );
  }

  return (
    <div style={{ margin: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>📋 差分プレビュー</span>
        <button
          onClick={() => onApplyDiff(replacementCode)}
          style={{
            padding: '6px 14px',
            backgroundColor: 'var(--vscode-button-background, #0e639c)',
            color: 'var(--vscode-button-foreground, #ffffff)',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          差分を適用する
        </button>
      </div>
      <div
        style={{
          border: '1px solid var(--vscode-widget-border, #454545)',
          borderRadius: '4px',
          padding: '12px',
          backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
        }}
      >
        <pre
          style={{
            margin: 0,
            fontSize: '12px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {`// 差分プレビュー\n${replacementCode}`}
        </pre>
      </div>
    </div>
  );
};

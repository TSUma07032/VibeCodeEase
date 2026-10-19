/**
 * [Why/Intent] 段階的ヒント（Lv1〜Lv4）の表示および開示モード切り替えを提供するコンポーネント。
 */
import React from 'react';
import type { ScaffoldingLevels } from '../../types';

/**
 * [Why/Intent] 親コンポーネント LearningScaffoldingPanel から授受されるProps定義。
 * 4段階ヒント文字列、アンロックレベル、開示モード、および各アンロック・モード切替コールバックを受け取る。
 */
interface ProgressiveHintCardProps {
  /** [Why/Intent] 段階的ヒントテキスト群(Lv1〜Lv4) */
  levels: ScaffoldingLevels;
  /** [Why/Intent] 現在アンロックされている最大ヒントレベル(1〜4) */
  unlockedLevel: 1 | 2 | 3 | 4;
  /** [Why/Intent] 段階的開示(stepByStep)または一括開示(direct) */
  disclosureMode: 'stepByStep' | 'direct';
  /** [Why/Intent] 開示モード変更コールバック */
  onSetMode: (mode: 'stepByStep' | 'direct') => void;
  /** [Why/Intent] 次レベルのアンロックコールバック */
  onUnlockNext: (nextLevel: 1 | 2 | 3 | 4) => void;
  /** [Why/Intent] 全レベル一括アンロックコールバック */
  onUnlockAll: () => void;
}

const cardStyle: React.CSSProperties = { border: '1px solid var(--vscode-widget-border, #454545)', borderRadius: '4px', padding: '10px' };

/** [Why/Intent] 各レベルヒント共通のカード枠を描画する内部コンポーネント */
const HintBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={cardStyle}>
    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--vscode-textLink-foreground)' }}>{title}</div>
    {children}
  </div>
);

/**
 * [Why/Intent] ヒントカードおよび開示モード切替・段階開示ボタンを描画する。
 */
export const ProgressiveHintCard: React.FC<ProgressiveHintCardProps> = ({
  levels, unlockedLevel, disclosureMode, onSetMode, onUnlockNext, onUnlockAll,
}) => {
  const isDirect = disclosureMode === 'direct';
  const maxLvl = isDirect ? 4 : unlockedLevel;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span>開示モード:</span>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="radio" name="mode" checked={!isDirect} onChange={() => onSetMode('stepByStep')} />
            少しずつ (推奨)
          </label>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="radio" name="mode" checked={isDirect} onChange={() => onSetMode('direct')} />
            一気に全開示
          </label>
        </div>
        {!isDirect && unlockedLevel < 4 && (
          <button onClick={onUnlockAll} style={{ background: 'none', color: 'var(--vscode-textLink-foreground)', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '11px' }}>
            ⚡ すぐに完成形と差分を見る (一括開示)
          </button>
        )}
      </div>

      <HintBox title="Lv 1: 観点ヒント (問いかけ)">
        <div style={{ fontSize: '13px', marginTop: '4px' }}>{levels.level1Perspective}</div>
      </HintBox>

      {maxLvl >= 2 && (
        <HintBox title="Lv 2: 概念ヒント (仕様・解説)">
          <div style={{ fontSize: '13px', marginTop: '4px' }}>{levels.level2Concept}</div>
        </HintBox>
      )}

      {maxLvl >= 3 && (
        <HintBox title="Lv 3: 骨組みコード (穴埋め)">
          <pre style={{ fontSize: '12px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{levels.level3SkeletonCode}</pre>
        </HintBox>
      )}

      {maxLvl >= 4 && (
        <HintBox title="Lv 4: 完成差分テキスト">
          <pre style={{ fontSize: '12px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{levels.level4CompleteDiff}</pre>
        </HintBox>
      )}

      {!isDirect && unlockedLevel < 4 && (
        <button
          onClick={() => onUnlockNext((unlockedLevel + 1) as 1 | 2 | 3 | 4)}
          style={{ padding: '8px 16px', backgroundColor: 'var(--vscode-button-background, #0e639c)', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer', fontWeight: 600 }}
        >
          ➡️ 次のヒントを開示する (Lv {unlockedLevel + 1})
        </button>
      )}
    </div>
  );
};

/**
 * [Why/Intent] 教育的見守り体験（スヌーズ時間、ヒント開示モード、既存推敲協調一時停止）の設定UIを提供する。
 */
import React from 'react';

/**
 * [Why/Intent] 親コンポーネント LearningSettingsPanel から授受されるProps定義。
 * スヌーズ時間・開示モード・一時停止トグル入力値および変更コールバックを受け取る。
 */
export interface BehaviorSettingsSectionProps {
  /** [Why/Intent] スヌーズ待機時間 (分) */
  snoozeMinutes: number;
  /** [Why/Intent] デフォルトのヒント開示モード ('stepByStep' | 'direct') */
  defaultDisclosureMode: 'stepByStep' | 'direct';
  /** [Why/Intent] 学習中の自動推敲一時停止フラグ */
  pauseExistingAnalysis: boolean;
  /** [Why/Intent] 値変更通知コールバック */
  onChange: (field: 'snoozeMinutes' | 'defaultDisclosureMode' | 'pauseExistingAnalysis', value: unknown) => void;
}

/**
 * [Why/Intent] 支援・ヒント体験及び協調動作設定セクションコンポーネント。
 */
export const BehaviorSettingsSection: React.FC<BehaviorSettingsSectionProps> = ({
  snoozeMinutes,
  defaultDisclosureMode,
  pauseExistingAnalysis,
  onChange,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h4 style={{ margin: '0 0 4px 0' }}>[3] 支援・ヒント体験</h4>
      <div>
        <div style={{ marginBottom: '6px', fontSize: '13px' }}>• 「自力で続ける」選択時のスヌーズ時間:</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { val: 3, label: '3分 (推奨)' },
            { val: 5, label: '5分' },
            { val: 10, label: '10分' },
          ].map(({ val, label }) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="snoozeMinutes"
                value={val}
                checked={snoozeMinutes === val}
                onChange={() => onChange('snoozeMinutes', val)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={{ marginBottom: '6px', fontSize: '13px' }}>• デフォルトのヒント開示モード:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="disclosureMode"
              value="stepByStep"
              checked={defaultDisclosureMode === 'stepByStep'}
              onChange={() => onChange('defaultDisclosureMode', 'stepByStep')}
            />
            少しずつ段階的に開示 (推奨: ネタバレ防止)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="disclosureMode"
              value="direct"
              checked={defaultDisclosureMode === 'direct'}
              onChange={() => onChange('defaultDisclosureMode', 'direct')}
            />
            一気に全開示
          </label>
        </div>
      </div>

      <h4 style={{ margin: '8px 0 4px 0' }}>[4] 既存機能との連携 & リソース保護</h4>
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={pauseExistingAnalysis}
            onChange={(e) => onChange('pauseExistingAnalysis', e.target.checked)}
          />
          学習セッション中は既存の「自動推敲」を自動停止する
        </label>
        <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', marginTop: '2px', marginLeft: '22px' }}>
          ※ Gemini APIのレートリミット(15RPM)の食い合いを防止します
        </div>
      </div>
    </div>
  );
};

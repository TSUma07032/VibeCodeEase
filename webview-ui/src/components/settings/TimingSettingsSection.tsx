/**
 * [Why/Intent] AI完成形予想の生成インターバルおよびタイピング後デバウンス待機時間の設定入力UIを提供する。
 */
import React from 'react';

/**
 * [Why/Intent] 親コンポーネント LearningSettingsPanel から授受されるProps定義。
 * AI予想インターバルとデバウンス入力値、エラーマップ、および変更コールバックを受け取る。
 */
export interface TimingSettingsSectionProps {
  /** [Why/Intent] AI生成インターバル (秒) */
  intervalSeconds: number;
  /** [Why/Intent] デバウンス待機時間 (秒) */
  debounceSeconds: number;
  /** [Why/Intent] バリデーションエラーマップ */
  errors: Record<string, string>;
  /** [Why/Intent] 値変更通知コールバック */
  onChange: (field: 'intervalSeconds' | 'debounceSeconds', value: number) => void;
}

/**
 * [Why/Intent] 見守り・推論タイミング設定セクションコンポーネント。
 */
export const TimingSettingsSection: React.FC<TimingSettingsSectionProps> = ({
  intervalSeconds,
  debounceSeconds,
  errors,
  onChange,
}) => {
  const errorBorder = '1px solid var(--vscode-inputValidation-errorBorder, #be1100)';
  const normalBorder = '1px solid var(--vscode-input-border, #3c3c3c)';
  const inputStyle = (hasErr: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '6px 8px',
    border: hasErr ? errorBorder : normalBorder,
    backgroundColor: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    boxSizing: 'border-box',
    borderRadius: '2px',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4 style={{ margin: '0 0 4px 0' }}>[1] 見守り・AI推論タイミング</h4>
      <div>
        <label htmlFor="intervalSeconds" style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
          • AI完成形予想の生成間隔 (秒):
        </label>
        <input
          id="intervalSeconds"
          type="number"
          value={intervalSeconds}
          onChange={(e) => onChange('intervalSeconds', Number(e.target.value))}
          style={inputStyle(Boolean(errors.intervalSeconds))}
        />
        {errors.intervalSeconds ? (
          <div style={{ color: 'var(--vscode-errorForeground, #f48771)', fontSize: '12px', marginTop: '2px' }}>
            {errors.intervalSeconds}
          </div>
        ) : (
          <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', marginTop: '2px' }}>
            ※ Gemini無料枠保護のため、最短10秒を推奨します (許容範囲: 10〜300秒)
          </div>
        )}
      </div>

      <div>
        <label htmlFor="debounceSeconds" style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
          • コード変更検知後のデバウンス待機時間 (秒):
        </label>
        <input
          id="debounceSeconds"
          type="number"
          value={debounceSeconds}
          onChange={(e) => onChange('debounceSeconds', Number(e.target.value))}
          style={inputStyle(Boolean(errors.debounceSeconds))}
        />
        {errors.debounceSeconds ? (
          <div style={{ color: 'var(--vscode-errorForeground, #f48771)', fontSize: '12px', marginTop: '2px' }}>
            {errors.debounceSeconds}
          </div>
        ) : (
          <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', marginTop: '2px' }}>
            ※ タイピング途中の不完全コード送信を防ぎます (許容範囲: 2〜15秒)
          </div>
        )}
      </div>
    </div>
  );
};

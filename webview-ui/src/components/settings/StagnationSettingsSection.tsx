/**
 * [Why/Intent] 停滞判定の感度パラメータ（連続無進展回数n、進捗変化率不感帯%）の設定UIを提供する。
 */
import React from 'react';

/**
 * [Why/Intent] 親コンポーネント LearningSettingsPanel から授受されるProps定義。
 * 停滞判定連続回数と進捗変化率閾値入力値、エラーマップ、および変更コールバックを受け取る。
 */
export interface StagnationSettingsSectionProps {
  /** [Why/Intent] 停滞とみなす連続回数 n (回) */
  thresholdN: number;
  /** [Why/Intent] 進捗停滞判定の変化率不感帯 (%) */
  deltaThreshold: number;
  /** [Why/Intent] バリデーションエラーマップ */
  errors: Record<string, string>;
  /** [Why/Intent] 値変更通知コールバック */
  onChange: (field: 'thresholdN' | 'deltaThreshold', value: number) => void;
}

/**
 * [Why/Intent] 停滞検出の感度設定セクションコンポーネント。
 */
export const StagnationSettingsSection: React.FC<StagnationSettingsSectionProps> = ({
  thresholdN,
  deltaThreshold,
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
      <h4 style={{ margin: '0 0 4px 0' }}>[2] 停滞検出 (Stagnation) の感度設定</h4>
      <div>
        <label htmlFor="stagnationThresholdN" style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
          • 停滞とみなす連続生成回数 (n回):
        </label>
        <input
          id="stagnationThresholdN"
          type="number"
          value={thresholdN}
          onChange={(e) => onChange('thresholdN', Number(e.target.value))}
          style={inputStyle(Boolean(errors.thresholdN))}
        />
        {errors.thresholdN ? (
          <div style={{ color: 'var(--vscode-errorForeground, #f48771)', fontSize: '12px', marginTop: '2px' }}>
            {errors.thresholdN}
          </div>
        ) : (
          <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', marginTop: '2px' }}>
            (目安: 約90秒間進展がない場合にバナー表示 / 許容範囲: 2〜10回)
          </div>
        )}
      </div>

      <div>
        <label htmlFor="progressDeltaThreshold" style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
          • 進捗停滞と判定する変化率の不感帯閾値 (%):
        </label>
        <input
          id="progressDeltaThreshold"
          type="number"
          value={deltaThreshold}
          onChange={(e) => onChange('deltaThreshold', Number(e.target.value))}
          style={inputStyle(Boolean(errors.deltaThreshold))}
        />
        {errors.deltaThreshold ? (
          <div style={{ color: 'var(--vscode-errorForeground, #f48771)', fontSize: '12px', marginTop: '2px' }}>
            {errors.deltaThreshold}
          </div>
        ) : (
          <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', marginTop: '2px' }}>
            (許容範囲: 1〜20%)
          </div>
        )}
      </div>
    </div>
  );
};

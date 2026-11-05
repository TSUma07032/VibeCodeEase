/**
 * [Why/Intent] vibeCodeEase サイドバーの初期画面コンポーネント。
 * ⚡ 簡易設定（ペルソナ、介入トリガー、モデル）、🔑 APIキー管理、📋 提案・依頼リストの
 * 3要素のみをミニマルに提供し、余計なボタンやCodeUIの重複を完全排除する。
 */
import React, { useState } from 'react';
import {
    FREQUENCY_OPTIONS,
    MODEL_OPTIONS,
    PERSONA_OPTIONS,
    getStatusBadge,
} from '../constants/sidebarOptions';
import type {
    InterventionItem,
    PersonaId,
} from '../types/onDemandIntervention';

/**
 * [Why/Intent] SidebarInitialViewコンポーネントが要求するPropsインターフェース。
 */
export interface SidebarInitialViewProps {
    personaId: PersonaId;
    onPersonaChange: (personaId: PersonaId) => void;
    frequency: 'manual' | 'onSave' | 'interval';
    onFrequencyChange: (frequency: 'manual' | 'onSave' | 'interval') => void;
    intervalSeconds: number;
    onIntervalSecondsChange: (seconds: number) => void;
    model: string;
    onModelChange: (model: string) => void;
    hasApiKey: boolean;
    apiKeyLength: number;
    onSaveApiKey: (apiKey: string) => void;
    interventions: InterventionItem[];
    onSelectIntervention: (id: string) => void;
}

/**
 * [Why/Intent] vibeCodeEase サイドバー初期画面の実装。
 */
export const SidebarInitialView: React.FC<SidebarInitialViewProps> = ({
    personaId,
    onPersonaChange,
    frequency,
    onFrequencyChange,
    model,
    onModelChange,
    hasApiKey,
    onSaveApiKey,
    interventions,
    onSelectIntervention,
}) => {
    const [isEditingApiKey, setIsEditingApiKey] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');

    /**
     * [Why/Intent] 入力されたGemini APIキーの前後の空白をトリムし、空でない場合に親コンポーネントへ
     * 保存要求（onSaveApiKey）を発行する。保存後は入力フォームをクリアして編集モードを閉じる。
     */
    const handleSaveApiKey = () => {
        if (!apiKeyInput.trim()) {
            return;
        }
        onSaveApiKey(apiKeyInput.trim());
        setApiKeyInput('');
        setIsEditingApiKey(false);
    };

    return (
        <div
            data-testid="sidebar-initial-view"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '12px',
                color: 'var(--vscode-foreground)',
                fontSize: '12px',
                boxSizing: 'border-box',
                width: '100%',
            }}
        >
            {/* ⚡ 簡易設定セクション */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--vscode-sideBar-background)',
                    border: '1px solid var(--vscode-panel-border)',
                }}
            >
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>⚡ 簡易設定</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="persona-select" style={{ fontWeight: 500 }}>
                        ペルソナ
                    </label>
                    <select
                        id="persona-select"
                        value={personaId}
                        onChange={(e) => onPersonaChange(e.target.value as PersonaId)}
                        style={{
                            padding: '4px 6px',
                            backgroundColor: 'var(--vscode-dropdown-background)',
                            color: 'var(--vscode-dropdown-foreground)',
                            border: '1px solid var(--vscode-dropdown-border)',
                            borderRadius: '3px',
                        }}
                    >
                        {PERSONA_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="frequency-select" style={{ fontWeight: 500 }}>
                        介入トリガー
                    </label>
                    <select
                        id="frequency-select"
                        value={frequency}
                        onChange={(e) =>
                            onFrequencyChange(e.target.value as 'manual' | 'onSave' | 'interval')
                        }
                        style={{
                            padding: '4px 6px',
                            backgroundColor: 'var(--vscode-dropdown-background)',
                            color: 'var(--vscode-dropdown-foreground)',
                            border: '1px solid var(--vscode-dropdown-border)',
                            borderRadius: '3px',
                        }}
                    >
                        {FREQUENCY_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="model-select" style={{ fontWeight: 500 }}>
                        モデル
                    </label>
                    <select
                        id="model-select"
                        value={model}
                        onChange={(e) => onModelChange(e.target.value)}
                        style={{
                            padding: '4px 6px',
                            backgroundColor: 'var(--vscode-dropdown-background)',
                            color: 'var(--vscode-dropdown-foreground)',
                            border: '1px solid var(--vscode-dropdown-border)',
                            borderRadius: '3px',
                        }}
                    >
                        {MODEL_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 🔑 APIキーセクション */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '10px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--vscode-sideBar-background)',
                    border: '1px solid var(--vscode-panel-border)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div style={{ fontWeight: 'bold' }}>🔑 Gemini API Key</div>
                    <div style={{ fontSize: '11px' }}>
                        {hasApiKey ? (
                            <span style={{ color: 'var(--vscode-testing-iconPassed, #4ec9b0)' }}>
                                ✅ 設定済
                            </span>
                        ) : (
                            <span style={{ color: 'var(--vscode-errorForeground, #f48771)' }}>
                                ⚠️ 未設定
                            </span>
                        )}
                    </div>
                </div>

                {!isEditingApiKey ? (
                    <div>
                        <button
                            type="button"
                            onClick={() => setIsEditingApiKey(true)}
                            style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                backgroundColor: 'var(--vscode-button-secondaryBackground)',
                                color: 'var(--vscode-button-secondaryForeground)',
                                border: 'none',
                                borderRadius: '3px',
                            }}
                        >
                            変更
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                            type="password"
                            placeholder="Gemini API Key"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            style={{
                                flex: 1,
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: 'var(--vscode-input-background)',
                                color: 'var(--vscode-input-foreground)',
                                border: '1px solid var(--vscode-input-border)',
                                borderRadius: '3px',
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleSaveApiKey}
                            style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                backgroundColor: 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                border: 'none',
                                borderRadius: '3px',
                            }}
                        >
                            保存
                        </button>
                    </div>
                )}
            </div>

            {/* 📋 提案・依頼リスト */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>📋 提案・依頼リスト</div>
                {interventions.length === 0 ? (
                    <div style={{ opacity: 0.7, padding: '8px' }}>
                        現在、未対応の改善提案はありません。
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {interventions.map((item) => {
                            const badge = getStatusBadge(item.status);
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => onSelectIntervention(item.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            onSelectIntervention(item.id);
                                        }
                                    }}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                        padding: '8px 10px',
                                        borderRadius: '4px',
                                        backgroundColor:
                                            'var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05))',
                                        border: '1px solid var(--vscode-panel-border)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <span style={{ fontWeight: 600 }}>{item.title}</span>
                                        <span
                                            style={{
                                                fontSize: '10px',
                                                padding: '1px 4px',
                                                borderRadius: '3px',
                                                border: `1px solid ${badge.color}`,
                                                color: badge.color,
                                            }}
                                        >
                                            {badge.label}
                                        </span>
                                    </div>
                                    {item.summary && (
                                        <div
                                            style={{
                                                fontSize: '11px',
                                                opacity: 0.8,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {item.summary}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

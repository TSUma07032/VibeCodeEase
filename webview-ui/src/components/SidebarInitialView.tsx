/**
 * [Why/Intent] vibeCodeEase サイドバーの初期画面（全面展開「💻 AI作業コード」＋最下部「📋 提案・依頼リスト（介入掲示板）」＋折りたたみ設定）コンポーネント。
 * - 上部（メイン全面表示）：「💻 AI作業コード（AIの作業スペース）」を内部スクロール枠なしで全面に表示。
 *   - 新しい提案（pending）はコード上にインライン差分ボックス（before / after / 採用・却下・詳細）としてはっきり表示する。
 *   - 古い提案（applied / dismissed / reverted）は該当行の右端にちっちゃいアイコンバッジ（✓介入1 / ✕介入2）として並べ、
 *     そのアイコンをクリックすると新提案と同じように「AI作業コード側でも」インライン差分ボックス（before / after / 採用・却下・詳細）が開閉される。
 * - 最下部（コードの一番下のさらに下）：「📋 提案・依頼リスト（過去分も含む介入掲示板）」を配置。
 *   各項目（介入1：要約、介入2：要約...）をクリックするとトグルが開き、
 *   before（-）/ after（+）差分および「採用」「却下」「詳細（チャットを開く）」ボタンを表示する。
 * - 設定：「⚙️ 設定」ボタンで簡易設定・Gemini APIキー管理を開閉できる。
 */
import React, { useState } from 'react';
import {
    FREQUENCY_OPTIONS,
    MODEL_OPTIONS,
    PERSONA_OPTIONS,
    formatShortTitle,
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
    documentText?: string;
    documentFileName?: string;
    onSelectIntervention: (id: string) => void;
    onApplyIntervention?: (id: string, editedCode?: string) => void;
    onRejectIntervention?: (id: string) => void;
    isSettingsOpen?: boolean;
    onToggleSettings?: () => void;
}

/**
 * [Why/Intent] 番号付きの介入エントリー構造体（1始まりの連番 indexNumber を保持）。
 */
interface IndexedIntervention {
    item: InterventionItem;
    indexNumber: number;
}

/**
 * [Why/Intent] コード文字列の各行に「- 」または「+ 」の差分プレフィックスを付与して整形する。
 * 空文字列または未定義の場合はプレースホルダを返す。
 */
function formatDiffBlock(code: string | undefined, prefix: '-' | '+'): string {
    if (!code || code.trim().length === 0) {
        return `${prefix} (コード情報なし)`;
    }
    return code
        .split(/\r?\n/)
        .map((line) => `${prefix} ${line}`)
        .join('\n');
}

/**
 * [Why/Intent] ファイルフルパスからファイル名（basename）のみを抽出するヘルパー。
 */
function extractBaseName(filePath: string | undefined): string {
    if (!filePath) {
        return '';
    }
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] ?? filePath;
}

/**
 * [Why/Intent] AI作業コード描画用の行配列を構築する。
 * documentText が同期済みの場合はその行配列をベースにしつつ、
 * 介入項目の行番号が documentText の行数を超える場合（または documentText 未同期時）でも
 * 介入対象行が欠落しないよう必要な行数を確保して originalCode を補完する。
 */
function buildWorkspaceLines(
    documentText: string | undefined,
    interventions: InterventionItem[],
): string[] {
    const baseLines =
        documentText && documentText.length > 0
            ? documentText.split(/\r?\n/)
            : [];
    const maxInterventionLine = interventions.reduce(
        (max, intv) =>
            Math.max(max, intv.range.end.line, intv.range.start.line),
        -1,
    );

    if (baseLines.length === 0 && maxInterventionLine < 0) {
        return [];
    }

    const totalLines = Math.max(baseLines.length, maxInterventionLine + 1);
    const result: string[] = Array.from(
        { length: totalLines },
        (_, idx) => baseLines[idx] ?? '',
    );

    // documentText 未同期時に originalCode から行テキストを補完
    if (baseLines.length === 0) {
        for (const intv of interventions) {
            if (intv.originalCode) {
                const origLines = intv.originalCode.split(/\r?\n/);
                origLines.forEach((lineText, offset) => {
                    const targetLine = intv.range.start.line + offset;
                    if (targetLine < result.length && !result[targetLine]) {
                        result[targetLine] = lineText;
                    }
                });
            }
        }
    }

    return result;
}

/**
 * [Why/Intent] AI作業コード内のインライン提案ボックス（新提案および右端アイコン押下で展開された過去提案の共通UI）を描画するサブコンポーネント。
 */
const WorkspaceInterventionBox: React.FC<{
    entry: IndexedIntervention;
    isPast: boolean;
    onApply?: (id: string, editedCode?: string) => void;
    onReject?: (id: string) => void;
    onDetail: (id: string) => void;
}> = ({ entry, isPast, onApply, onReject, onDetail }) => {
    const { item, indexNumber } = entry;
    const shortTitle = formatShortTitle(item.title);
    const badge = getStatusBadge(item.status);
    const isApplied = item.status === 'applied';
    const isDismissed = item.status === 'dismissed';
    const beforeBlock = formatDiffBlock(item.originalCode, '-');
    const afterBlock = formatDiffBlock(item.proposedCode, '+');

    return (
        <div
            data-testid={
                isPast
                    ? `workspace-past-box-${item.id}`
                    : `workspace-pending-box-${item.id}`
            }
            style={{
                marginLeft: '36px',
                padding: '8px 10px',
                borderRadius: '6px',
                border: isPast
                    ? `1px solid ${badge.color}`
                    : '1px solid var(--vscode-focusBorder, #007fd4)',
                backgroundColor: isPast
                    ? 'rgba(128, 128, 128, 0.08)'
                    : 'rgba(0, 127, 212, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontFamily: 'sans-serif',
            }}
        >
            <div
                style={{
                    fontWeight: 600,
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px',
                }}
            >
                <span>{`💡 介入${indexNumber}：${shortTitle}`}</span>
                <span
                    style={{
                        fontSize: '11px',
                        color: isPast ? badge.color : 'inherit',
                        opacity: 0.9,
                    }}
                >
                    {isPast ? badge.label : '新提案'}
                </span>
            </div>

            <div
                style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--vscode-errorForeground, #f48771)',
                }}
            >
                before
            </div>
            <pre
                data-testid={`workspace-before-${item.id}`}
                style={{
                    margin: 0,
                    padding: '4px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: 'var(--mono, monospace)',
                    backgroundColor: 'rgba(244, 135, 113, 0.1)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                }}
            >
                {beforeBlock}
            </pre>

            <div
                style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--vscode-testing-iconPassed, #4ec9b0)',
                }}
            >
                after
            </div>
            <pre
                data-testid={`workspace-after-${item.id}`}
                style={{
                    margin: 0,
                    padding: '4px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: 'var(--mono, monospace)',
                    backgroundColor: 'rgba(78, 201, 176, 0.1)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                }}
            >
                {afterBlock}
            </pre>

            <div
                style={{
                    display: 'flex',
                    gap: '6px',
                    flexWrap: 'wrap',
                }}
            >
                <button
                    type="button"
                    data-testid={`workspace-apply-${item.id}`}
                    disabled={isApplied}
                    onClick={() => onApply?.(item.id, item.proposedCode)}
                    style={{
                        padding: '3px 8px',
                        fontSize: '11.5px',
                        cursor: isApplied ? 'not-allowed' : 'pointer',
                        opacity: isApplied ? 0.5 : 1,
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '4px',
                    }}
                >
                    採用
                </button>
                <button
                    type="button"
                    data-testid={`workspace-reject-${item.id}`}
                    disabled={isDismissed}
                    onClick={() => onReject?.(item.id)}
                    style={{
                        padding: '3px 8px',
                        fontSize: '11.5px',
                        cursor: isDismissed ? 'not-allowed' : 'pointer',
                        opacity: isDismissed ? 0.5 : 1,
                        backgroundColor: 'transparent',
                        color: 'var(--vscode-errorForeground, #f48771)',
                        border: '1px solid var(--vscode-errorForeground, #f48771)',
                        borderRadius: '4px',
                    }}
                >
                    却下
                </button>
                <button
                    type="button"
                    data-testid={`workspace-detail-${item.id}`}
                    onClick={() => onDetail(item.id)}
                    style={{
                        padding: '3px 8px',
                        fontSize: '11.5px',
                        cursor: 'pointer',
                        backgroundColor:
                            'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: '4px',
                    }}
                >
                    詳細
                </button>
            </div>
        </div>
    );
};

/**
 * [Why/Intent] vibeCodeEase サイドバー初期画面の実装。
 * 上部に全面展開の「💻 AI作業コード（新提案はインライン表示、過去提案は行右端にちっちゃいアイコン表示＋押下でAI作業コード上でもインライン展開）」、
 * 一番下のさらに下に「📋 提案・依頼リスト（過去分も含むトグル式掲示板）」を配置する。
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
    documentText,
    documentFileName,
    onSelectIntervention,
    onApplyIntervention,
    onRejectIntervention,
    isSettingsOpen,
    onToggleSettings,
}) => {
    const [isEditingApiKey, setIsEditingApiKey] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
    const [workspaceExpandedPastIds, setWorkspaceExpandedPastIds] = useState<
        Record<string, boolean>
    >({});

    const settingsOpen = isSettingsOpen ?? internalSettingsOpen;

    /**
     * [Why/Intent] 「⚙️ 設定」ボタン押下時に、親制御（onToggleSettings）または内部ステートを切り替える。
     */
    const handleToggleSettings = () => {
        if (onToggleSettings) {
            onToggleSettings();
        } else {
            setInternalSettingsOpen((prev) => !prev);
        }
    };

    /**
     * [Why/Intent] 掲示板リスト内の指定した介入項目（介入1、介入2...）のアコーディオン開閉状態を切り替える。
     */
    const handleToggleItem = (id: string) => {
        setExpandedIds((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    /**
     * [Why/Intent] AI作業コード右端のちっちゃい過去介入アイコンをクリックした際、
     * 新提案と同じように「AI作業コード側でも」インライン差分ボックスを開閉し、下部掲示板のトグルとも連動させる。
     */
    const handleClickPastIcon = (id: string) => {
        const nextOpen = !workspaceExpandedPastIds[id];
        setWorkspaceExpandedPastIds((prev) => ({
            ...prev,
            [id]: nextOpen,
        }));
        setExpandedIds((prev) => ({
            ...prev,
            [id]: nextOpen,
        }));
    };

    const currentPersonaOption =
        PERSONA_OPTIONS.find((opt) => opt.id === personaId) ??
        PERSONA_OPTIONS[0];

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

    const activeCount = interventions.filter(
        (item) => item.status !== 'dismissed',
    ).length;

    const indexedInterventions: IndexedIntervention[] = interventions.map(
        (item, index) => ({
            item,
            indexNumber: index + 1,
        }),
    );

    // 行番号ごとの「新しい提案（pending）」と「古い提案（applied / dismissed / reverted）」のマップを作成
    const pendingByStartLine = new Map<number, IndexedIntervention[]>();
    const pastByStartLine = new Map<number, IndexedIntervention[]>();
    for (const entry of indexedInterventions) {
        const line = entry.item.range.start.line;
        if (entry.item.status === 'pending') {
            const list = pendingByStartLine.get(line) ?? [];
            list.push(entry);
            pendingByStartLine.set(line, list);
        } else {
            const list = pastByStartLine.get(line) ?? [];
            list.push(entry);
            pastByStartLine.set(line, list);
        }
    }

    const workspaceLines = buildWorkspaceLines(documentText, interventions);
    const baseFileName = extractBaseName(documentFileName);

    return (
        <div
            data-testid="sidebar-initial-view"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                padding: '12px',
                color: 'var(--vscode-foreground)',
                fontSize: '13px',
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
            }}
        >
            {/* 最上部ヘッダー：AI作業スペース見出し ＋ ⚙️ 設定トグルボタン */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                    }}
                >
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>
                        💻 AI作業コード
                    </span>
                    {baseFileName && (
                        <span
                            style={{
                                fontSize: '11.5px',
                                opacity: 0.75,
                                fontFamily: 'var(--mono, monospace)',
                                color: 'var(--vscode-descriptionForeground)',
                            }}
                        >
                            ({baseFileName})
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    data-testid="toggle-settings-btn"
                    aria-expanded={settingsOpen}
                    onClick={handleToggleSettings}
                    style={{
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        cursor: 'pointer',
                        backgroundColor: settingsOpen
                            ? 'var(--vscode-button-background)'
                            : 'var(--vscode-button-secondaryBackground)',
                        color: settingsOpen
                            ? 'var(--vscode-button-foreground)'
                            : 'var(--vscode-button-secondaryForeground)',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                    }}
                >
                    ⚙️ 設定
                </button>
            </div>

            {/* ⚙️ 折りたたみ設定パネル（簡易設定 ＋ Gemini API Key） */}
            {settingsOpen && (
                <div
                    data-testid="sidebar-settings-panel"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}
                >
                    {/* ⚡ 簡易設定セクション */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            padding: '12px',
                            borderRadius: '6px',
                            backgroundColor:
                                'var(--vscode-editor-background, rgba(0, 0, 0, 0.15))',
                            border: '1px solid var(--vscode-panel-border)',
                        }}
                    >
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>
                            ⚡ 簡易設定
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                            }}
                        >
                            <label
                                htmlFor="persona-select"
                                style={{ fontWeight: 500, fontSize: '12px' }}
                            >
                                ペルソナ
                            </label>
                            <select
                                id="persona-select"
                                value={personaId}
                                onChange={(e) =>
                                    onPersonaChange(e.target.value as PersonaId)
                                }
                                style={{
                                    width: '100%',
                                    padding: '5px 8px',
                                    fontSize: '12.5px',
                                    backgroundColor:
                                        'var(--vscode-dropdown-background)',
                                    color: 'var(--vscode-dropdown-foreground)',
                                    border: '1px solid var(--vscode-dropdown-border)',
                                    borderRadius: '4px',
                                }}
                            >
                                {PERSONA_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            {currentPersonaOption && (
                                <div
                                    style={{
                                        fontSize: '11.5px',
                                        opacity: 0.8,
                                        color: 'var(--vscode-descriptionForeground)',
                                        paddingTop: '2px',
                                    }}
                                >
                                    {currentPersonaOption.description}
                                </div>
                            )}
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                            }}
                        >
                            <label
                                htmlFor="frequency-select"
                                style={{ fontWeight: 500, fontSize: '12px' }}
                            >
                                介入トリガー
                            </label>
                            <select
                                id="frequency-select"
                                value={frequency}
                                onChange={(e) =>
                                    onFrequencyChange(
                                        e.target.value as
                                            | 'manual'
                                            | 'onSave'
                                            | 'interval',
                                    )
                                }
                                style={{
                                    width: '100%',
                                    padding: '5px 8px',
                                    fontSize: '12.5px',
                                    backgroundColor:
                                        'var(--vscode-dropdown-background)',
                                    color: 'var(--vscode-dropdown-foreground)',
                                    border: '1px solid var(--vscode-dropdown-border)',
                                    borderRadius: '4px',
                                }}
                            >
                                {FREQUENCY_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                            }}
                        >
                            <label
                                htmlFor="model-select"
                                style={{ fontWeight: 500, fontSize: '12px' }}
                            >
                                モデル
                            </label>
                            <select
                                id="model-select"
                                value={model}
                                onChange={(e) => onModelChange(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '5px 8px',
                                    fontSize: '12.5px',
                                    backgroundColor:
                                        'var(--vscode-dropdown-background)',
                                    color: 'var(--vscode-dropdown-foreground)',
                                    border: '1px solid var(--vscode-dropdown-border)',
                                    borderRadius: '4px',
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
                            padding: '12px',
                            borderRadius: '6px',
                            backgroundColor:
                                'var(--vscode-editor-background, rgba(0, 0, 0, 0.15))',
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
                            <div style={{ fontWeight: 600, fontSize: '13px' }}>
                                🔑 Gemini API Key
                            </div>
                            <div style={{ fontSize: '12px' }}>
                                {hasApiKey ? (
                                    <span
                                        style={{
                                            color: 'var(--vscode-testing-iconPassed, #4ec9b0)',
                                        }}
                                    >
                                        ✅ 設定済
                                    </span>
                                ) : (
                                    <span
                                        style={{
                                            color: 'var(--vscode-errorForeground, #f48771)',
                                        }}
                                    >
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
                                        padding: '5px 12px',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        backgroundColor:
                                            'var(--vscode-button-secondaryBackground)',
                                        color: 'var(--vscode-button-secondaryForeground)',
                                        border: 'none',
                                        borderRadius: '4px',
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
                                    onChange={(e) =>
                                        setApiKeyInput(e.target.value)
                                    }
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        padding: '5px 8px',
                                        fontSize: '12px',
                                        backgroundColor:
                                            'var(--vscode-input-background)',
                                        color: 'var(--vscode-input-foreground)',
                                        border: '1px solid var(--vscode-input-border)',
                                        borderRadius: '4px',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveApiKey}
                                    style={{
                                        padding: '5px 12px',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        backgroundColor:
                                            'var(--vscode-button-background)',
                                        color: 'var(--vscode-button-foreground)',
                                        border: 'none',
                                        borderRadius: '4px',
                                    }}
                                >
                                    保存
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 💻 上部メイン全面エリア：AI作業コード（内部スクロール枠なし・全面展開） */}
            <div
                data-testid="ai-workspace-code"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor:
                        'var(--vscode-editor-background, rgba(0, 0, 0, 0.2))',
                    border: '1px solid var(--vscode-panel-border)',
                    fontFamily: 'var(--mono, monospace)',
                    fontSize: '12px',
                }}
            >
                {workspaceLines.length === 0 ? (
                    <div
                        style={{
                            opacity: 0.7,
                            padding: '8px',
                            textAlign: 'center',
                            fontFamily: 'sans-serif',
                        }}
                    >
                        左側のエディタでコードを開くと、ここにAI作業スペースが同期されます。
                    </div>
                ) : (
                    workspaceLines.map((lineText, lineIdx) => {
                        const pendingItems =
                            pendingByStartLine.get(lineIdx) ?? [];
                        const pastItems = pastByStartLine.get(lineIdx) ?? [];
                        const expandedPastItems = pastItems.filter(
                            ({ item }) =>
                                Boolean(workspaceExpandedPastIds[item.id]),
                        );

                        return (
                            <div
                                key={`ws-line-${lineIdx}`}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                }}
                            >
                                {/* コード行本体 ＋ 右端のちっちゃい過去提案アイコン群 */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px',
                                        minHeight: '20px',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            minWidth: 0,
                                            flex: 1,
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: '28px',
                                                textAlign: 'right',
                                                opacity: 0.45,
                                                userSelect: 'none',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {lineIdx + 1}
                                        </span>
                                        <span
                                            style={{
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-all',
                                                flex: 1,
                                            }}
                                        >
                                            {lineText || ' '}
                                        </span>
                                    </div>

                                    {/* 古い提案（採用済・却下済）は行の右端にちっちゃいアイコンバッジとして並べる */}
                                    {pastItems.length > 0 && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {pastItems.map(
                                                ({ item, indexNumber }) => {
                                                    const isApplied =
                                                        item.status ===
                                                        'applied';
                                                    const isPastExpanded =
                                                        Boolean(
                                                            workspaceExpandedPastIds[
                                                                item.id
                                                            ],
                                                        );
                                                    return (
                                                        <button
                                                            key={`past-icon-${item.id}`}
                                                            type="button"
                                                            data-testid={`workspace-past-icon-${item.id}`}
                                                            aria-expanded={
                                                                isPastExpanded
                                                            }
                                                            title={`介入${indexNumber}：${formatShortTitle(item.title)} (${isApplied ? '採用済' : '却下済'}) - クリックでAI作業コード上に展開`}
                                                            onClick={() =>
                                                                handleClickPastIcon(
                                                                    item.id,
                                                                )
                                                            }
                                                            style={{
                                                                padding:
                                                                    '1px 5px',
                                                                fontSize:
                                                                    '10.5px',
                                                                cursor: 'pointer',
                                                                borderRadius:
                                                                    '10px',
                                                                border: isApplied
                                                                    ? '1px solid var(--vscode-testing-iconPassed, #4ec9b0)'
                                                                    : '1px solid var(--vscode-descriptionForeground, #888)',
                                                                backgroundColor:
                                                                    isApplied
                                                                        ? 'rgba(78, 201, 176, 0.14)'
                                                                        : 'rgba(128, 128, 128, 0.12)',
                                                                color: isApplied
                                                                    ? 'var(--vscode-testing-iconPassed, #4ec9b0)'
                                                                    : 'var(--vscode-descriptionForeground, #aaa)',
                                                                whiteSpace:
                                                                    'nowrap',
                                                            }}
                                                        >
                                                            {isApplied
                                                                ? `✓介入${indexNumber}`
                                                                : `✕介入${indexNumber}`}
                                                        </button>
                                                    );
                                                },
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 過去分アイコンをクリックした際は、新提案と同じように「AI作業コード側でも」インライン展開する */}
                                {expandedPastItems.map((entry) => (
                                    <WorkspaceInterventionBox
                                        key={`ws-past-box-${entry.item.id}`}
                                        entry={entry}
                                        isPast={true}
                                        onApply={onApplyIntervention}
                                        onReject={onRejectIntervention}
                                        onDetail={onSelectIntervention}
                                    />
                                ))}

                                {/* 新しい提案（pending）はAI作業コード上にはっきりとインライン表示する */}
                                {pendingItems.map((entry) => (
                                    <WorkspaceInterventionBox
                                        key={`ws-pending-box-${entry.item.id}`}
                                        entry={entry}
                                        isPast={false}
                                        onApply={onApplyIntervention}
                                        onReject={onRejectIntervention}
                                        onDetail={onSelectIntervention}
                                    />
                                ))}
                            </div>
                        );
                    })
                )}
            </div>

            {/* 📋 最下部エリア（コードの一番下のさらに下）：提案・依頼リスト（過去介入も含めて全部見られるトグル式掲示板） */}
            <div
                data-testid="intervention-bulletin-board"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                        📋 提案・依頼リスト
                    </div>
                    {interventions.length > 0 && (
                        <span
                            style={{
                                fontSize: '11.5px',
                                opacity: 0.75,
                                color: 'var(--vscode-descriptionForeground)',
                            }}
                        >
                            有効 {activeCount}件 / 全 {interventions.length}
                            件（過去分込）
                        </span>
                    )}
                </div>

                {interventions.length === 0 ? (
                    <div
                        style={{
                            opacity: 0.75,
                            padding: '12px',
                            fontSize: '12.5px',
                            borderRadius: '6px',
                            border: '1px dashed var(--vscode-panel-border)',
                            textAlign: 'center',
                        }}
                    >
                        現在、未対応の改善提案はありません。
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                        }}
                    >
                        {indexedInterventions.map(({ item, indexNumber }) => {
                            const badge = getStatusBadge(item.status);
                            const isDismissed = item.status === 'dismissed';
                            const isApplied = item.status === 'applied';
                            const isExpanded = Boolean(expandedIds[item.id]);
                            const shortTitle = formatShortTitle(item.title);
                            const startLine = item.range.start.line + 1;
                            const endLine = item.range.end.line + 1;
                            const lineLabel =
                                startLine === endLine
                                    ? `L${startLine}`
                                    : `L${startLine}-L${endLine}`;
                            const summaryFirstLine =
                                item.summary
                                    ?.split(/\r?\n/)
                                    .find((l) => l.trim().length > 0) ?? '';
                            const beforeBlock = formatDiffBlock(
                                item.originalCode,
                                '-',
                            );
                            const afterBlock = formatDiffBlock(
                                item.proposedCode,
                                '+',
                            );

                            return (
                                <div
                                    key={item.id}
                                    data-testid={`proposal-card-${item.id}`}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        padding: '10px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: isDismissed
                                            ? 'rgba(128, 128, 128, 0.06)'
                                            : 'var(--vscode-editor-background, rgba(255, 255, 255, 0.04))',
                                        border: isDismissed
                                            ? '1px dashed var(--vscode-panel-border)'
                                            : '1px solid var(--vscode-panel-border)',
                                        opacity: isDismissed ? 0.6 : 1,
                                        transition: 'opacity 0.15s ease',
                                    }}
                                >
                                    {/* トグルヘッダー（介入N：要約） */}
                                    <div
                                        data-testid={`proposal-toggle-${item.id}`}
                                        onClick={() =>
                                            handleToggleItem(item.id)
                                        }
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={isExpanded}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === 'Enter' ||
                                                e.key === ' '
                                            ) {
                                                e.preventDefault();
                                                handleToggleItem(item.id);
                                            }
                                        }}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px',
                                                flex: 1,
                                                minWidth: 0,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: '11px',
                                                        opacity: 0.8,
                                                    }}
                                                >
                                                    {isExpanded ? '▼' : '▶'}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: '11px',
                                                        padding: '1px 5px',
                                                        borderRadius: '3px',
                                                        backgroundColor:
                                                            'var(--vscode-badge-background, rgba(128,128,128,0.2))',
                                                        color: 'var(--vscode-badge-foreground, inherit)',
                                                        fontFamily:
                                                            'var(--mono, monospace)',
                                                    }}
                                                >
                                                    {lineLabel}
                                                </span>
                                                <span
                                                    style={{
                                                        fontWeight: 600,
                                                        fontSize: '12.5px',
                                                        lineHeight: 1.4,
                                                        textDecoration:
                                                            isDismissed
                                                                ? 'line-through'
                                                                : 'none',
                                                        wordBreak: 'break-word',
                                                    }}
                                                >
                                                    {`介入${indexNumber}：${shortTitle}`}
                                                </span>
                                            </div>

                                            {!isExpanded && summaryFirstLine && (
                                                <div
                                                    style={{
                                                        fontSize: '12px',
                                                        lineHeight: 1.45,
                                                        opacity: isDismissed
                                                            ? 0.65
                                                            : 0.85,
                                                        color: 'var(--vscode-descriptionForeground)',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient:
                                                            'vertical',
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    {summaryFirstLine}
                                                </div>
                                            )}
                                        </div>

                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'flex-end',
                                                gap: '6px',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontSize: '11px',
                                                    padding: '1px 6px',
                                                    borderRadius: '3px',
                                                    border: `1px solid ${badge.color}`,
                                                    color: badge.color,
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {badge.label}
                                            </span>
                                        </div>
                                    </div>

                                    {/* トグル展開ボディ（before / after / 採用・却下・詳細） */}
                                    {isExpanded && (
                                        <div
                                            data-testid={`proposal-body-${item.id}`}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px',
                                                paddingTop: '6px',
                                                borderTop:
                                                    '1px solid var(--vscode-panel-border)',
                                            }}
                                        >
                                            {summaryFirstLine && (
                                                <div
                                                    style={{
                                                        fontSize: '12px',
                                                        lineHeight: 1.45,
                                                        color: 'var(--vscode-descriptionForeground)',
                                                    }}
                                                >
                                                    {summaryFirstLine}
                                                </div>
                                            )}

                                            {/* before ブロック */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '3px',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: 'var(--vscode-errorForeground, #f48771)',
                                                    }}
                                                >
                                                    before
                                                </div>
                                                <pre
                                                    data-testid={`proposal-before-${item.id}`}
                                                    style={{
                                                        margin: 0,
                                                        padding: '6px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11.5px',
                                                        lineHeight: 1.4,
                                                        fontFamily:
                                                            'var(--mono, monospace)',
                                                        backgroundColor:
                                                            'rgba(244, 135, 113, 0.08)',
                                                        border: '1px solid rgba(244, 135, 113, 0.25)',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                        overflowX: 'auto',
                                                    }}
                                                >
                                                    {beforeBlock}
                                                </pre>
                                            </div>

                                            {/* after ブロック */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '3px',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: 'var(--vscode-testing-iconPassed, #4ec9b0)',
                                                    }}
                                                >
                                                    after
                                                </div>
                                                <pre
                                                    data-testid={`proposal-after-${item.id}`}
                                                    style={{
                                                        margin: 0,
                                                        padding: '6px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11.5px',
                                                        lineHeight: 1.4,
                                                        fontFamily:
                                                            'var(--mono, monospace)',
                                                        backgroundColor:
                                                            'rgba(78, 201, 176, 0.08)',
                                                        border: '1px solid rgba(78, 201, 176, 0.25)',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                        overflowX: 'auto',
                                                    }}
                                                >
                                                    {afterBlock}
                                                </pre>
                                            </div>

                                            {/* アクションボタン列：採用 / 却下 / 詳細 */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    gap: '8px',
                                                    flexWrap: 'wrap',
                                                    paddingTop: '2px',
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    data-testid={`proposal-apply-${item.id}`}
                                                    disabled={isApplied}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onApplyIntervention?.(
                                                            item.id,
                                                            item.proposedCode,
                                                        );
                                                    }}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '12px',
                                                        cursor: isApplied
                                                            ? 'not-allowed'
                                                            : 'pointer',
                                                        opacity: isApplied
                                                            ? 0.5
                                                            : 1,
                                                        backgroundColor:
                                                            'var(--vscode-button-background)',
                                                        color: 'var(--vscode-button-foreground)',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                    }}
                                                >
                                                    採用
                                                </button>

                                                <button
                                                    type="button"
                                                    data-testid={`proposal-reject-${item.id}`}
                                                    disabled={isDismissed}
                                                    aria-label="この提案を破棄"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRejectIntervention?.(
                                                            item.id,
                                                        );
                                                    }}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '12px',
                                                        cursor: isDismissed
                                                            ? 'not-allowed'
                                                            : 'pointer',
                                                        opacity: isDismissed
                                                            ? 0.5
                                                            : 1,
                                                        backgroundColor:
                                                            'transparent',
                                                        color: 'var(--vscode-errorForeground, #f48771)',
                                                        border: '1px solid var(--vscode-errorForeground, #f48771)',
                                                        borderRadius: '4px',
                                                    }}
                                                >
                                                    却下
                                                </button>

                                                <button
                                                    type="button"
                                                    data-testid={`proposal-detail-${item.id}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectIntervention(
                                                            item.id,
                                                        );
                                                    }}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '12px',
                                                        cursor: 'pointer',
                                                        backgroundColor:
                                                            'var(--vscode-button-secondaryBackground)',
                                                        color: 'var(--vscode-button-secondaryForeground)',
                                                        border: '1px solid var(--vscode-panel-border)',
                                                        borderRadius: '4px',
                                                    }}
                                                >
                                                    詳細
                                                </button>
                                            </div>
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

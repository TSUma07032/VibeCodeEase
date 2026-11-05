/**
 * [Why/Intent] Side-by-SideエディタのReact側ルートコンポーネントであり、
 * Extensionからのイベントを購読して状態（ドキュメント内容・提案一覧・履歴目次・AI稼働状態・各種設定）を管理・分配する責務を持つ。
 * EXPAND_INTERVENTION_DETAILを受信した際はオンデマンド2カラムサイドパネル（OnDemandSidePanel）を展開描画し、
 * NAVIGATE_TO_SETTINGSを受信した際は設定画面（SettingsPanel）へ直接タブ遷移する。
 */
import { useEffect, useState } from 'react';
import { MirrorEditor } from './components/MirrorEditor';
import { OnDemandSidePanel } from './components/OnDemandSidePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { TabBar, type TabType } from './components/TabBar';
import type {
    AiInterventionLevel,
    ExtensionToWebviewMessage,
    WebviewIntervention,
} from './types';
import type {
    InterventionDetail,
    InterventionItem,
    PersonaId,
} from './types/onDemandIntervention';
import type { ExtensionToWebviewInterventionMessage } from './types/onDemandIpcMessages';
import { vscode } from './utils/vscode';

/**
 * [Why/Intent] 提案ステータスに応じたバッジ表示ラベルとカラー定義を返すヘルパー関数。
 */
function getStatusBadge(status: InterventionItem['status']): { label: string; color: string } {
    switch (status) {
        case 'applied':
            return { label: '✅ 適用済', color: 'var(--vscode-testing-iconPassed, #4ec9b0)' };
        case 'reverted':
            return { label: '↩️ 取消済', color: 'var(--vscode-descriptionForeground, #888888)' };
        case 'dismissed':
            return { label: '🗑️ 却下', color: 'var(--vscode-errorForeground, #f48771)' };
        default:
            return { label: '🟡 未確認', color: 'var(--vscode-editorWarning-foreground, #cca700)' };
    }
}

/**
 * [Why/Intent] メインアプリケーションコンポーネント。
 * 常設上部タブバー、AI稼働ステータス＆クイック解析バー、介入提案の目次リスト、
 * オンデマンド詳細（Diff＋5ペルソナAI対話）、および設定画面を統合管理する。
 */
function App() {
    const [fileName, setFileName] = useState<string>('');
    const [text, setText] = useState<string>('');
    const [interventions, setInterventions] = useState<WebviewIntervention[]>([]);
    const [historySummaries, setHistorySummaries] = useState<InterventionItem[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('code');

    const [hasApiKey, setHasApiKey] = useState<boolean>(false);
    const [apiKeyLength, setApiKeyLength] = useState<number>(0);
    const [aiInterventionLevel, setAiInterventionLevel] = useState<AiInterventionLevel>(
        'Level 2 (Refactoring)',
    );

    const [llmFrequency, setLlmFrequency] = useState<'manual' | 'onSave' | 'interval'>('onSave');
    const [llmIntervalSeconds, setLlmIntervalSeconds] = useState<number>(10);
    const [llmModel, setLlmModel] = useState<string>('gemini-3.5-flash-lite');

    // AI稼働ステータス・エラーログ管理
    const [llmStatus, setLlmStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [latestErrorLog, setLatestErrorLog] = useState<string | null>(null);

    // オンデマンドインラインAI機能用State
    const [onDemandDetail, setOnDemandDetail] = useState<InterventionDetail | null>(null);
    const [onDemandPersona, setOnDemandPersona] = useState<PersonaId>('concise');
    const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

    useEffect(() => {
        const handleMessage = (
            event: MessageEvent<
                | ExtensionToWebviewMessage
                | ExtensionToWebviewInterventionMessage
                | { type: 'SYNC_SESSION_STATE' }
            >,
        ) => {
            const message = event.data;
            if (!message || typeof message !== 'object') {
                return;
            }

            if ('type' in message) {
                switch (message.type) {
                    case 'EXPAND_INTERVENTION_DETAIL':
                        setActiveTab('code');
                        setOnDemandDetail(message.payload.detail);
                        setOnDemandPersona(message.payload.persona);
                        break;
                    case 'NAVIGATE_TO_SETTINGS':
                        // [Why/Intent] オンデマンド2カラム詳細が表示されている場合、設定画面との表示競合やレイアウト崩れを防ぐため、詳細選択を解除(null)した上で設定タブへ切り替える
                        setOnDemandDetail(null);
                        setActiveTab('settings');
                        break;
                    case 'SYNC_HISTORY_STATE': {
                        setHistorySummaries(message.payload.interventions);
                        setOnDemandDetail((prev) => {
                            if (!prev) {
                                return null;
                            }
                            const matching = message.payload.interventions.find(
                                (i) => i.id === prev.id,
                            );
                            if (matching) {
                                return { ...prev, status: matching.status };
                            }
                            return prev;
                        });
                        break;
                    }
                    case 'RECEIVE_CHAT_MESSAGE':
                        setOnDemandDetail((prev) => {
                            if (!prev || prev.id !== message.payload.interventionId) {
                                return prev;
                            }
                            const existing = prev.chatHistory ?? [];
                            return {
                                ...prev,
                                chatHistory: [...existing, message.payload.message],
                            };
                        });
                        break;
                    case 'SET_CHAT_LOADING':
                        setIsChatLoading(message.payload.isLoading);
                        break;
                    case 'SYNC_DOCUMENT':
                        setFileName(message.fileName);
                        setText(message.text);
                        break;
                    case 'UPDATE_INTERVENTIONS':
                        setInterventions(message.interventions);
                        break;
                    case 'SYNC_SETTINGS':
                        setHasApiKey(message.hasApiKey);
                        setApiKeyLength(message.apiKeyLength ?? 0);
                        setAiInterventionLevel(message.interventionLevel);
                        if ('frequency' in message) {
                            setLlmFrequency(message.frequency);
                            setLlmIntervalSeconds(message.intervalSeconds);
                            setLlmModel(message.model);
                        }
                        break;
                    case 'LLM_DASHBOARD_INIT':
                        setLlmStatus(message.status);
                        if (message.logs && message.logs.length > 0) {
                            setLatestErrorLog(message.logs[message.logs.length - 1].message);
                        }
                        break;
                    case 'LLM_STATUS_UPDATE':
                        setLlmStatus(message.status);
                        if (message.status === 'idle') {
                            setLatestErrorLog(null);
                        }
                        break;
                    case 'LLM_ERROR_LOG':
                        setLlmStatus('error');
                        setLatestErrorLog(message.message);
                        break;
                    case 'SYNC_SESSION_STATE':
                    case 'LLM_RESPONSE_UPDATE':
                        break;
                }
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ command: 'ready' });
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleTabChange = (tab: TabType) => {
        if (tab === 'settings') {
            setOnDemandDetail(null);
        }
        setActiveTab(tab);
    };

    const handleApply = (intervention: WebviewIntervention) => {
        vscode.postMessage({
            command: 'apply_intervention',
            id: intervention.id,
            newText: intervention.replacementText,
            range: intervention.range,
        });
    };

    const handleDiscard = (id: string) => {
        vscode.postMessage({
            command: 'discard_intervention',
            id,
        });
    };

    const handleUpdateApiKey = (key: string) => {
        vscode.postMessage({
            command: 'update_api_key',
            apiKey: key,
        });
    };

    const handleUpdateLevel = (level: AiInterventionLevel) => {
        vscode.postMessage({
            command: 'update_intervention_level',
            level,
        });
        setAiInterventionLevel(level);
    };

    const handleForceAnalyze = () => {
        setLlmStatus('loading');
        setLatestErrorLog(null);
        vscode.postMessage({ command: 'force_analyze' });
    };

    // 目次アイテムクリック時にオンデマンド詳細を展開する
    const handleOpenDetailFromToc = (itemId: string) => {
        const matchingIntv = interventions.find((i) => i.id === itemId);
        const matchingSummary = historySummaries.find((s) => s.id === itemId);
        if (matchingIntv) {
            const now = new Date().toISOString();
            setOnDemandDetail({
                id: matchingIntv.id,
                title:
                    matchingSummary?.title ??
                    matchingIntv.message.replace(/^🤖\s*\*\*AI\s*提案\*\*:\s*/, '').slice(0, 45),
                summary: matchingSummary?.summary ?? matchingIntv.message,
                range: matchingIntv.range,
                status: matchingSummary?.status ?? 'pending',
                personaId: onDemandPersona,
                originalCode: matchingIntv.originalText,
                proposedCode: matchingIntv.replacementText,
                createdAt: now,
                updatedAt: now,
                chatHistory: [],
            });
        }
        vscode.postMessage({
            type: 'REQUEST_EXPAND_DETAIL',
            payload: { interventionId: itemId },
        });
    };

    // オンデマンドアクションハンドラ
    const handleOnDemandApply = (id: string) => {
        vscode.postMessage({
            type: 'APPLY_INTERVENTION',
            payload: { interventionId: id },
        });
    };

    const handleOnDemandUndo = (id: string) => {
        vscode.postMessage({
            type: 'UNDO_INTERVENTION',
            payload: { interventionId: id },
        });
    };

    const handleOnDemandDiscard = (id: string) => {
        vscode.postMessage({
            type: 'DISCARD_INTERVENTION',
            payload: { interventionId: id },
        });
    };

    const handleOnDemandSwitchPersona = (persona: PersonaId) => {
        setOnDemandPersona(persona);
        vscode.postMessage({
            type: 'SWITCH_PERSONA',
            payload: { personaId: persona },
        });
    };

    const handleOnDemandSendMessage = (id: string, textContent: string) => {
        vscode.postMessage({
            type: 'SEND_CHAT_MESSAGE',
            payload: {
                interventionId: id,
                personaId: onDemandPersona,
                text: textContent,
            },
        });
    };

    const handleOnDemandClose = () => {
        setOnDemandDetail(null);
        vscode.postMessage({
            type: 'CLOSE_SIDE_PANEL',
        });
    };

    // 目次表示用の統合リスト構築
    const tocItems: InterventionItem[] =
        historySummaries.length > 0
            ? historySummaries
            : interventions.map((intv) => ({
                  id: intv.id,
                  title: intv.message.replace(/^🤖\s*\*\*AI\s*提案\*\*:\s*/, '').slice(0, 50),
                  summary: intv.message,
                  range: intv.range,
                  status: 'pending' as const,
                  personaId: onDemandPersona,
                  createdAt: '',
                  updatedAt: '',
              }));

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* 常設上部タブバー：どの画面状態でも設定やコードタブへ自在に遷移可能 */}
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

            <div
                style={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {activeTab === 'code' &&
                    (onDemandDetail ? (
                        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                            <OnDemandSidePanel
                                detail={onDemandDetail}
                                persona={onDemandPersona}
                                isLoading={isChatLoading}
                                onApply={handleOnDemandApply}
                                onUndo={handleOnDemandUndo}
                                onDiscard={handleOnDemandDiscard}
                                onSendMessage={handleOnDemandSendMessage}
                                onSwitchPersona={handleOnDemandSwitchPersona}
                                onClose={handleOnDemandClose}
                            />
                        </div>
                    ) : !fileName ? (
                        <div
                            style={{
                                padding: '20px',
                                color: 'var(--vscode-editor-foreground)',
                                fontFamily: 'sans-serif',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px',
                            }}
                        >
                            <div>Waiting for document sync...</div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={handleForceAnalyze}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor: 'var(--vscode-button-background)',
                                        color: 'var(--vscode-button-foreground)',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                    }}
                                >
                                    🚀 今すぐAI解析を実行
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTabChange('settings')}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor:
                                            'var(--vscode-button-secondaryBackground)',
                                        color: 'var(--vscode-button-secondaryForeground)',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                    }}
                                >
                                    ⚙️ APIキー・設定を開く
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* 上部 AI ステータス & クイックアクションバー */}
                            <div
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor:
                                        'var(--vscode-editorGroupHeader-tabsBackground)',
                                    borderBottom:
                                        '1px solid var(--vscode-editorGroupHeader-tabsBorder)',
                                    color: 'var(--vscode-tab-activeForeground)',
                                    fontFamily: 'sans-serif',
                                    fontSize: '13px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                    }}
                                >
                                    <span style={{ fontWeight: 'bold' }}>
                                        {fileName.split(/\\|\//).pop()}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            backgroundColor:
                                                'var(--vscode-badge-background, #333)',
                                            color: 'var(--vscode-badge-foreground, #fff)',
                                        }}
                                    >
                                        {llmStatus === 'loading'
                                            ? '⏳ AI解析中...'
                                            : llmStatus === 'error'
                                              ? '⚠️ AI通信エラー'
                                              : `🟢 提案 ${tocItems.length}件`}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={handleForceAnalyze}
                                        disabled={llmStatus === 'loading'}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            backgroundColor: 'var(--vscode-button-background)',
                                            color: 'var(--vscode-button-foreground)',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor:
                                                llmStatus === 'loading'
                                                    ? 'not-allowed'
                                                    : 'pointer',
                                            opacity: llmStatus === 'loading' ? 0.6 : 1,
                                        }}
                                    >
                                        {llmStatus === 'loading'
                                            ? '⏳ 解析中...'
                                            : '🚀 今すぐAI解析'}
                                    </button>
                                </div>
                            </div>

                            {/* エラー発生時のインライン警告バナー */}
                            {llmStatus === 'error' && latestErrorLog && (
                                <div
                                    style={{
                                        margin: '8px 12px 0 12px',
                                        padding: '8px 12px',
                                        backgroundColor:
                                            'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
                                        border: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '8px',
                                    }}
                                >
                                    <span style={{ wordBreak: 'break-all' }}>
                                        ⚠️ {latestErrorLog}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleTabChange('settings')}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '11px',
                                            whiteSpace: 'nowrap',
                                            backgroundColor:
                                                'var(--vscode-button-secondaryBackground)',
                                            color: 'var(--vscode-button-secondaryForeground)',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        ⚙️ 設定を確認
                                    </button>
                                </div>
                            )}

                            {/* 📌 AI介入提案の目次（サマリーボード） */}
                            {tocItems.length > 0 && (
                                <div
                                    style={{
                                        margin: '8px 12px',
                                        padding: '10px',
                                        backgroundColor: 'var(--vscode-sideBar-background)',
                                        border: '1px solid var(--vscode-panel-border)',
                                        borderRadius: '4px',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            marginBottom: '8px',
                                            color: 'var(--vscode-descriptionForeground)',
                                        }}
                                    >
                                        📌 AI介入案 目次（クリックでDiff詳細 & AI対話を展開）
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px',
                                        }}
                                    >
                                        {tocItems.map((item) => {
                                            const badge = getStatusBadge(item.status);
                                            return (
                                                <div
                                                    key={`toc-${item.id}`}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '6px 10px',
                                                        backgroundColor:
                                                            'var(--vscode-editor-background)',
                                                        border: '1px solid var(--vscode-widget-border)',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        gap: '8px',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                color: badge.color,
                                                                fontSize: '11px',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontFamily: 'monospace',
                                                                fontSize: '11px',
                                                                color: 'var(--vscode-descriptionForeground)',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            L{item.range.start.line + 1}
                                                        </span>
                                                        <span
                                                            style={{
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {item.title}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleOpenDetailFromToc(item.id)
                                                        }
                                                        style={{
                                                            padding: '3px 8px',
                                                            fontSize: '11px',
                                                            whiteSpace: 'nowrap',
                                                            backgroundColor:
                                                                'var(--vscode-button-background)',
                                                            color: 'var(--vscode-button-foreground)',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        💬 詳細・対話
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* エディタ差分ビュー */}
                            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                                <MirrorEditor
                                    text={text}
                                    interventions={interventions}
                                    onApply={handleApply}
                                    onDiscard={handleDiscard}
                                />
                            </div>
                        </div>
                    ))}
                {activeTab === 'settings' && (
                    <SettingsPanel
                        hasApiKey={hasApiKey}
                        apiKeyLength={apiKeyLength}
                        aiInterventionLevel={aiInterventionLevel}
                        frequency={llmFrequency}
                        intervalSeconds={llmIntervalSeconds}
                        model={llmModel}
                        onUpdateApiKey={handleUpdateApiKey}
                        onUpdateLevel={handleUpdateLevel}
                        onForceAnalyze={handleForceAnalyze}
                    />
                )}
            </div>
        </div>
    );
}

export default App;

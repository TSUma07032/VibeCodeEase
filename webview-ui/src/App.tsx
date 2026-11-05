/**
 * [Why/Intent] Side-by-SideエディタのReact側ルートコンポーネントであり、
 * Extensionからのイベントを購読して状態（ドキュメント内容・提案一覧・各種設定）を管理・分配する責務を持つ。
 * EXPAND_INTERVENTION_DETAILを受信した際はオンデマンド2カラムサイドパネル（OnDemandSidePanel）を展開描画する。
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
import type { InterventionDetail, PersonaId } from './types/onDemandIntervention';
import type { ExtensionToWebviewInterventionMessage } from './types/onDemandIpcMessages';
import { vscode } from './utils/vscode';

/**
 * [Why/Intent] メインアプリケーションコンポーネント。
 * エディタ同期、提案反映・破棄、設定更新、およびオンデマンド介入表示を管理する。
 */
function App() {
    const [fileName, setFileName] = useState<string>('');
    const [text, setText] = useState<string>('');
    const [interventions, setInterventions] = useState<WebviewIntervention[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('code');

    const [hasApiKey, setHasApiKey] = useState<boolean>(false);
    const [apiKeyLength, setApiKeyLength] = useState<number>(0);
    const [aiInterventionLevel, setAiInterventionLevel] = useState<AiInterventionLevel>(
        'Level 2 (Refactoring)',
    );

    const [llmFrequency, setLlmFrequency] = useState<'manual' | 'onSave' | 'interval'>('onSave');
    const [llmIntervalSeconds, setLlmIntervalSeconds] = useState<number>(10);
    const [llmModel, setLlmModel] = useState<string>('gemini-3.5-flash-lite');

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
                        setOnDemandDetail(message.payload.detail);
                        setOnDemandPersona(message.payload.persona);
                        break;
                    case 'SYNC_HISTORY_STATE': {
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
                    case 'SYNC_SESSION_STATE':
                    case 'LLM_STATUS_UPDATE':
                    case 'LLM_RESPONSE_UPDATE':
                    case 'LLM_ERROR_LOG':
                    case 'LLM_DASHBOARD_INIT':
                        break;
                }
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ command: 'ready' });
        return () => window.removeEventListener('message', handleMessage);
    }, []);

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
        vscode.postMessage({ command: 'force_analyze' });
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

    // オンデマンド表示モード
    if (onDemandDetail) {
        return (
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
        );
    }

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                {activeTab === 'code' &&
                    (!fileName ? (
                        <div
                            style={{
                                padding: '20px',
                                color: 'var(--vscode-editor-foreground)',
                                fontFamily: 'sans-serif',
                            }}
                        >
                            Waiting for document sync...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                                }}
                            >
                                {fileName.split(/\\|\//).pop()}
                            </div>
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

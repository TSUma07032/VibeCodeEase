/**
 * [Why/Intent] vibeCodeEase サイドバーのReact側ルートコンポーネント。
 * ExtensionからのIPCメッセージを購読し、初期状態（SidebarInitialView）と
 * 介入対話パネル（SidebarDialogueView）の画面遷移（sidebarMode）および状態管理を統括する。
 * 重複エディタ（MirrorEditor）や常設TabBar、旧SettingsPanelを完全撤去し、軽量なサイドバーUIを提供する。
 */
import { useEffect, useState } from 'react';
import { SidebarDialogueView } from './components/SidebarDialogueView';
import { SidebarInitialView } from './components/SidebarInitialView';
import type { ExtensionToWebviewMessage } from './types';
import type {
    InterventionDetail,
    InterventionItem,
    PersonaId,
} from './types/onDemandIntervention';
import type { ExtensionToWebviewInterventionMessage } from './types/onDemandIpcMessages';
import { vscode } from './utils/vscode';

/**
 * [Why/Intent] メインアプリケーションコンポーネント。
 */
function App() {
    const [sidebarMode, setSidebarMode] = useState<'initial' | 'dialogue'>(
        'initial',
    );
    const [selectedDetail, setSelectedDetail] =
        useState<InterventionDetail | null>(null);
    const [interventions, setInterventions] = useState<InterventionItem[]>([]);

    // 簡易設定およびAPIキー状態
    const [hasApiKey, setHasApiKey] = useState<boolean>(false);
    const [apiKeyLength, setApiKeyLength] = useState<number>(0);
    const [personaId, setPersonaId] = useState<PersonaId>('mentor');
    const [frequency, setFrequency] = useState<'manual' | 'onSave' | 'interval'>(
        'onSave',
    );
    const [intervalSeconds, setIntervalSeconds] = useState<number>(60);
    const [model, setModel] = useState<string>('gemini-3.5-flash-lite');

    // ローディング・エラー状態
    const [isRefining, setIsRefining] = useState<boolean>(false);
    const [refineError, setRefineError] = useState<string | null>(null);
    const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

    useEffect(() => {
        const handleMessage = (
            event: MessageEvent<
                | ExtensionToWebviewMessage
                | ExtensionToWebviewInterventionMessage
                | {
                      type: 'SYNC_SESSION_STATE';
                      payload?: unknown;
                  }
                | {
                      type: 'LLM_DASHBOARD_INIT';
                      status?: unknown;
                      response?: unknown;
                      logs?: unknown;
                  }
                | {
                      type: 'LLM_STATUS_UPDATE';
                      status?: unknown;
                  }
            >,
        ) => {
            const message = event.data;
            if (!message || typeof message !== 'object') {
                return;
            }

            if ('type' in message) {
                switch (message.type) {
                    case 'EXPAND_INTERVENTION_DETAIL':
                        setSelectedDetail(message.payload.detail);
                        setPersonaId(message.payload.persona);
                        setSidebarMode('dialogue');
                        break;
                    case 'UPDATE_INTERVENTION_DETAIL':
                        setSelectedDetail(message.payload.detail);
                        break;
                    case 'SET_REFINE_LOADING':
                        setIsRefining(message.payload.isLoading);
                        if (message.payload.error) {
                            setRefineError(message.payload.error);
                        } else if (message.payload.isLoading) {
                            setRefineError(null);
                        }
                        break;
                    case 'RECEIVE_CHAT_MESSAGE':
                        setSelectedDetail((prev) => {
                            if (
                                !prev ||
                                prev.id !== message.payload.interventionId
                            ) {
                                return prev;
                            }
                            const existing = prev.chatHistory ?? [];
                            return {
                                ...prev,
                                chatHistory: [
                                    ...existing,
                                    message.payload.message,
                                ],
                            };
                        });
                        break;
                    case 'SET_CHAT_LOADING':
                        setIsChatLoading(message.payload.isLoading);
                        break;
                    case 'SYNC_HISTORY_STATE': {
                        setInterventions(message.payload.interventions);
                        setSelectedDetail((prev) => {
                            if (!prev) {
                                return null;
                            }
                            const matching =
                                message.payload.interventions.find(
                                    (i) => i.id === prev.id,
                                );
                            if (matching) {
                                return { ...prev, status: matching.status };
                            }
                            return prev;
                        });
                        break;
                    }
                    case 'SYNC_SETTINGS':
                        setHasApiKey(message.hasApiKey);
                        setApiKeyLength(message.apiKeyLength ?? 0);
                        if ('frequency' in message && message.frequency) {
                            setFrequency(message.frequency);
                        }
                        if (
                            'intervalSeconds' in message &&
                            message.intervalSeconds !== undefined
                        ) {
                            setIntervalSeconds(message.intervalSeconds);
                        }
                        if ('model' in message && message.model) {
                            setModel(message.model);
                        }
                        if ('personaId' in message && message.personaId) {
                            setPersonaId(message.personaId as PersonaId);
                        }
                        break;
                    case 'NAVIGATE_TO_SETTINGS':
                        // [Why/Intent] 設定へのナビゲーション要求時は詳細選択を解除し、初期画面（SidebarInitialView: 簡易設定＋APIキー）を表示する
                        setSelectedDetail(null);
                        setSidebarMode('initial');
                        break;
                    case 'UPDATE_INTERVENTIONS':
                        if (interventions.length === 0) {
                            setInterventions(
                                message.interventions.map((intv) => ({
                                    id: intv.id,
                                    title: intv.message
                                        .replace(/^🤖\s*\*\*AI\s*提案\*\*:\s*/, '')
                                        .slice(0, 50),
                                    summary: intv.message,
                                    range: intv.range,
                                    status: 'pending',
                                    personaId,
                                    createdAt: '',
                                    updatedAt: '',
                                })),
                            );
                        }
                        break;
                }
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ command: 'ready' });
        return () => window.removeEventListener('message', handleMessage);
    }, [interventions.length, personaId]);

    /**
     * [Why/Intent] 選択されたペルソナ属性をローカル状態へ即座に反映し、
     * ExtensionへUPDATE_QUICK_SETTINGSメッセージを送信してワークスペース状態へ永続化する。
     */
    const handlePersonaChange = (newPersona: PersonaId) => {
        setPersonaId(newPersona);
        vscode.postMessage({
            type: 'UPDATE_QUICK_SETTINGS',
            payload: { personaId: newPersona },
        });
    };

    /**
     * [Why/Intent] 介入実行トリガーモード（onSave/interval/manual）を更新し、
     * ExtensionへUPDATE_QUICK_SETTINGSメッセージを送信してVS Code設定（llm.syncFrequency）へ永続化する。
     */
    const handleFrequencyChange = (
        newFreq: 'manual' | 'onSave' | 'interval',
    ) => {
        setFrequency(newFreq);
        vscode.postMessage({
            type: 'UPDATE_QUICK_SETTINGS',
            payload: { frequency: newFreq },
        });
    };

    /**
     * [Why/Intent] 自動推敲の実行間隔秒数を更新し、
     * ExtensionへUPDATE_QUICK_SETTINGSメッセージを送信してVS Code設定（llm.syncIntervalSeconds）へ永続化する。
     */
    const handleIntervalSecondsChange = (newSec: number) => {
        setIntervalSeconds(newSec);
        vscode.postMessage({
            type: 'UPDATE_QUICK_SETTINGS',
            payload: { intervalSeconds: newSec },
        });
    };

    /**
     * [Why/Intent] 推敲用Geminiモデル識別子を更新し、
     * ExtensionへUPDATE_QUICK_SETTINGSメッセージを送信してVS Code設定（llmModel）へ永続化する。
     */
    const handleModelChange = (newModel: string) => {
        setModel(newModel);
        vscode.postMessage({
            type: 'UPDATE_QUICK_SETTINGS',
            payload: { model: newModel },
        });
    };

    /**
     * [Why/Intent] 入力されたGemini APIキーをExtensionへ送信（UPDATE_API_KEY）し、
     * 安全なシークレットストア（SecretStorage）へ暗号化永続化する。
     */
    const handleSaveApiKey = (key: string) => {
        vscode.postMessage({
            type: 'UPDATE_API_KEY',
            payload: { apiKey: key },
        });
    };

    /**
     * [Why/Intent] 提案アイテムが選択された際、ローカルの履歴リストや直近の介入情報からフォールバック詳細を
     * 即時構築して画面遷移（setSidebarMode('dialogue')）させる「楽観的UIレンダリング」を行う。
     * Extensionとの往復通信（REQUEST_EXPAND_DETAIL）を待たずに即時に対話ビューを描画することで、
     * ユーザーの体感レイテンシを最小化し、その後サーバーからの最新詳細通知で内容を完全同期する。
     */
    const handleSelectIntervention = (id: string) => {
        const item = interventions.find((i) => i.id === id);
        const now = new Date().toISOString();
        const detail: InterventionDetail = {
            id,
            title: item?.title ?? 'AI提案',
            summary: item?.summary ?? '',
            range: item?.range ?? {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
            status: item?.status ?? 'pending',
            personaId,
            originalCode: '',
            proposedCode: '',
            createdAt: item?.createdAt || now,
            updatedAt: item?.updatedAt || now,
            chatHistory: [],
        };
        setSelectedDetail(detail);
        setSidebarMode('dialogue');
        vscode.postMessage({
            type: 'REQUEST_EXPAND_DETAIL',
            payload: { interventionId: id },
        });
    };

    /**
     * [Why/Intent] 対話パネルから初期画面（一覧・簡易設定）へ戻るハンドラ。
     * 詳細選択およびエラーバナーを解除し、一覧ビューへ復元する。
     */
    const handleBackToInitial = () => {
        setSelectedDetail(null);
        setRefineError(null);
        setSidebarMode('initial');
    };

    /**
     * [Why/Intent] ユーザーからの方針修正指示（instruction）をExtensionへ送信（REFINE_INTERVENTION）し、
     * LLMによるコードと理由の再推敲をトリガーする。
     */
    const handleRefine = (instruction: string) => {
        if (!selectedDetail) {
            return;
        }
        vscode.postMessage({
            type: 'REFINE_INTERVENTION',
            payload: {
                interventionId: selectedDetail.id,
                userInstruction: instruction,
                personaId,
            },
        });
    };

    /**
     * [Why/Intent] ユーザーが入力したチャットメッセージをローカルのchatHistoryへ即時追加する「楽観的チャット表示」を行い、
     * 直ちにExtensionへIPC送信（SEND_CHAT_MESSAGE）する。
     * これによりメッセージ送信直後のユーザー体感レスポンスを滑らかにし、後続のAI応答（RECEIVE_CHAT_MESSAGE）を待機する。
     */
    const handleSendMessage = (text: string) => {
        if (!selectedDetail) {
            return;
        }
        const userMsg = {
            id: `msg-${Date.now()}`,
            sender: 'user' as const,
            message: text,
            timestamp: new Date().toISOString(),
        };
        setSelectedDetail((prev) =>
            prev
                ? {
                      ...prev,
                      chatHistory: [...(prev.chatHistory ?? []), userMsg],
                  }
                : null,
        );
        vscode.postMessage({
            type: 'SEND_CHAT_MESSAGE',
            payload: {
                interventionId: selectedDetail.id,
                personaId,
                text,
            },
        });
    };

    /**
     * [Why/Intent] 対象提案のコード置換適用要求をExtensionへ発行する（APPLY_INTERVENTION）。
     */
    const handleApply = (id: string) => {
        vscode.postMessage({
            type: 'APPLY_INTERVENTION',
            payload: { interventionId: id },
        });
    };

    /**
     * [Why/Intent] 適用済みの提案コードを取り消し、元コードへ復元する要求をExtensionへ発行する（UNDO_INTERVENTION）。
     */
    const handleUndo = (id: string) => {
        vscode.postMessage({
            type: 'UNDO_INTERVENTION',
            payload: { interventionId: id },
        });
    };

    /**
     * [Why/Intent] 対象提案を却下・無効化する要求をExtensionへ発行する（DISCARD_INTERVENTION）。
     */
    const handleReject = (id: string) => {
        vscode.postMessage({
            type: 'DISCARD_INTERVENTION',
            payload: { interventionId: id },
        });
    };

    return (
        <div
            className="sidebar-container"
            style={{
                height: '100vh',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflowX: 'hidden',
                overflowY: 'auto',
            }}
        >
            {/* メイン画面描画: sidebarMode による切り替え */}
            {sidebarMode === 'initial' ? (
                <SidebarInitialView
                    personaId={personaId}
                    onPersonaChange={handlePersonaChange}
                    frequency={frequency}
                    onFrequencyChange={handleFrequencyChange}
                    intervalSeconds={intervalSeconds}
                    onIntervalSecondsChange={handleIntervalSecondsChange}
                    model={model}
                    onModelChange={handleModelChange}
                    hasApiKey={hasApiKey}
                    apiKeyLength={apiKeyLength}
                    onSaveApiKey={handleSaveApiKey}
                    interventions={interventions}
                    onSelectIntervention={handleSelectIntervention}
                />
            ) : selectedDetail ? (
                <SidebarDialogueView
                    detail={selectedDetail}
                    onBack={handleBackToInitial}
                    onRefine={handleRefine}
                    isRefining={isRefining}
                    refineError={refineError}
                    onSendMessage={handleSendMessage}
                    isChatLoading={isChatLoading}
                    onApply={handleApply}
                    onUndo={handleUndo}
                    onReject={handleReject}
                />
            ) : null}
        </div>
    );
}

export default App;

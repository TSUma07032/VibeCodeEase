/**
 * [Why/Intent] vibeCodeEase サイドバーのReact側ルートコンポーネント。
 * ExtensionからのIPCメッセージを購読し、初期状態（SidebarInitialView: 上部「AI作業コード」＋下部「トグル式介入掲示板リスト」＋開閉式設定）と
 * 介入対話パネル（SidebarDialogueView: チャット＆詳細画面）の画面遷移（sidebarMode）および状態管理を統括する。
 * 「詳細」ボタン押下時には、常に一番上の介入案ではなく、その時押された介入IDの詳細・チャット履歴を確実に展開する。
 */
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { SidebarDialogueView } from './components/SidebarDialogueView';
import { SidebarInitialView } from './components/SidebarInitialView';
import {
    formatShortTitle,
    getPersonaOpeningLine,
} from './constants/sidebarOptions';
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
    const [documentText, setDocumentText] = useState<string>('');
    const [documentFileName, setDocumentFileName] = useState<string>('');
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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

    // 初期マウント時に1度だけ ready ハンドシェイクを送信する
    useEffect(() => {
        vscode.postMessage({ command: 'ready' });
    }, []);

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
                    case 'SYNC_DOCUMENT':
                        setDocumentText(message.text);
                        setDocumentFileName(message.fileName);
                        break;
                    case 'EXPAND_INTERVENTION_DETAIL':
                        // [Why/Intent] ホバーまたは掲示板の「詳細」押下時にバッチング遅延なく即座に該当IDの対話画面へ切り替える（RULE-007）
                        flushSync(() => {
                            setSelectedDetail(message.payload.detail);
                            setPersonaId(message.payload.persona);
                            setSidebarMode('dialogue');
                        });
                        break;
                    case 'UPDATE_INTERVENTION_DETAIL':
                        setSelectedDetail((prev) =>
                            prev && prev.id === message.payload.interventionId
                                ? message.payload.detail
                                : prev,
                        );
                        setInterventions((prev) =>
                            prev.map((item) =>
                                item.id === message.payload.interventionId
                                    ? message.payload.detail
                                    : item,
                            ),
                        );
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
                                return {
                                    ...prev,
                                    status: matching.status,
                                    originalCode:
                                        matching.originalCode ??
                                        prev.originalCode,
                                    proposedCode:
                                        matching.proposedCode ??
                                        prev.proposedCode,
                                };
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
                        setSelectedDetail(null);
                        setSidebarMode('initial');
                        setIsSettingsOpen(true);
                        break;
                    case 'UPDATE_INTERVENTIONS':
                        setInterventions((prev) => {
                            if (prev.length === 0) {
                                return message.interventions.map((intv) => ({
                                    id: intv.id,
                                    title: formatShortTitle(intv.message),
                                    summary: intv.message,
                                    range: intv.range,
                                    status: 'pending',
                                    personaId: 'mentor',
                                    createdAt: '',
                                    updatedAt: '',
                                    originalCode: intv.originalText,
                                    proposedCode: intv.replacementText,
                                }));
                            }
                            return prev;
                        });
                        break;
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

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
     * [Why/Intent] AI作業コードまたは掲示板のトグル内で「詳細」ボタンが押された際、
     * その時押された介入ID（id）の originalCode / proposedCode / chatHistory を保持した詳細データを構築して
     * チャット対話画面（setSidebarMode('dialogue')）へ即時遷移させ、Extensionへも該当IDの展開要求を送信する。
     */
    const handleSelectIntervention = (id: string) => {
        const item = interventions.find((i) => i.id === id);
        const now = new Date().toISOString();
        const activePersona = item?.personaId ?? personaId;
        const shortTitle = formatShortTitle(item?.title ?? 'AI提案');
        const existingChat =
            item?.chatHistory && item.chatHistory.length > 0
                ? item.chatHistory
                : [
                      {
                          id: `opening-${id}`,
                          sender: 'ai' as const,
                          message: getPersonaOpeningLine(
                              activePersona,
                              shortTitle,
                          ),
                          timestamp: now,
                          personaId: activePersona,
                      },
                  ];
        const detail: InterventionDetail = {
            id,
            title: shortTitle,
            summary: item?.summary ?? '',
            range: item?.range ?? {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
            status: item?.status ?? 'pending',
            personaId: activePersona,
            originalCode: item?.originalCode ?? '',
            proposedCode: item?.proposedCode ?? '',
            createdAt: item?.createdAt || now,
            updatedAt: item?.updatedAt || now,
            chatHistory: existingChat,
        };
        setSelectedDetail(detail);
        setSidebarMode('dialogue');
        vscode.postMessage({
            type: 'REQUEST_EXPAND_DETAIL',
            payload: { interventionId: id },
        });
    };

    /**
     * [Why/Intent] 対話パネルから初期画面（AI作業スペース＋掲示板リスト）へ戻るハンドラ。
     */
    const handleBackToInitial = () => {
        setSelectedDetail(null);
        setRefineError(null);
        setSidebarMode('initial');
    };

    /**
     * [Why/Intent] ユーザーからの方針修正指示（instruction）をExtensionへ送信（REFINE_INTERVENTION）する。
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
        setInterventions((prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, status: 'applied' } : item,
            ),
        );
        setSelectedDetail((prev) =>
            prev && prev.id === id ? { ...prev, status: 'applied' } : prev,
        );
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
     * ローカル状態も即座に 'dismissed' へ更新し、「却下された感」の強いUIフィードバックを即時反映する。
     */
    const handleReject = (id: string) => {
        setInterventions((prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, status: 'dismissed' } : item,
            ),
        );
        setSelectedDetail((prev) =>
            prev && prev.id === id ? { ...prev, status: 'dismissed' } : prev,
        );
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
                maxWidth: '100%',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflowX: 'hidden',
                overflowY: 'auto',
                scrollbarGutter: 'stable',
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
                    documentText={documentText}
                    documentFileName={documentFileName}
                    onSelectIntervention={handleSelectIntervention}
                    onApplyIntervention={handleApply}
                    onRejectIntervention={handleReject}
                    isSettingsOpen={isSettingsOpen}
                    onToggleSettings={() =>
                        setIsSettingsOpen((prev) => !prev)
                    }
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

/**
 * [Why/Intent] vibeCodeEase サイドバーのReact側ルートコンポーネント。
 * ExtensionからのIPCメッセージを購読し、常時表示の左ペイン（SidebarInitialView: AI作業コード＋介入掲示板＋設定）と、
 * 「詳細」押下時にサイドバーを一時拡大して右隣へ並べる右ペイン（SidebarDialogueView: before/after＋AIチャット）による
 * 縦3ライン構成（ユーザー作業エディタ｜AI作業コード｜詳細＆チャット）および双方向スクロール同期を統括する。
 */
import { type CSSProperties, useEffect, useRef, useState } from 'react';
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
import {
    computeScrollTopForLine,
    findTopVisibleLine,
} from './utils/scrollSync';
import { vscode } from './utils/vscode';

const WEBVIEW_SCROLL_SUPPRESS_MS = 250;

/**
 * [Why/Intent] メインアプリケーションコンポーネント。
 */
function App() {
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
    const [scrollSyncEnabled, setScrollSyncEnabled] = useState<boolean>(true);
    const [editorFontSize, setEditorFontSize] = useState<number | undefined>(
        undefined,
    );
    const [editorLineHeight, setEditorLineHeight] = useState<
        number | undefined
    >(undefined);

    // スクロール同期用の参照・ループ抑止ロック
    const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
    const scrollSyncEnabledRef = useRef<boolean>(true);
    const suppressWebviewScrollUntilRef = useRef<number>(0);
    const lastSentTopLineRef = useRef<number | null>(null);
    const scrollRafIdRef = useRef<number | null>(null);

    useEffect(() => {
        scrollSyncEnabledRef.current = scrollSyncEnabled;
    }, [scrollSyncEnabled]);

    // ローディング・エラー状態
    const [isRefining, setIsRefining] = useState<boolean>(false);
    const [refineError, setRefineError] = useState<string | null>(null);
    const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

    // 初期マウント時に1度だけ ready ハンドシェイクを送信し、アンマウント時にrAFを破棄する
    useEffect(() => {
        vscode.postMessage({ command: 'ready' });
        return () => {
            if (scrollRafIdRef.current !== null) {
                window.cancelAnimationFrame(scrollRafIdRef.current);
                scrollRafIdRef.current = null;
            }
        };
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
                        lastSentTopLineRef.current = null;
                        break;
                    case 'SYNC_EDITOR_SCROLL': {
                        if (!scrollSyncEnabledRef.current) {
                            break;
                        }
                        const container = sidebarContainerRef.current;
                        if (!container) {
                            break;
                        }
                        const nextScrollTop = computeScrollTopForLine(
                            container,
                            message.topLine,
                        );
                        if (nextScrollTop === null) {
                            break;
                        }
                        lastSentTopLineRef.current = message.topLine;
                        if (Math.abs(container.scrollTop - nextScrollTop) > 1) {
                            suppressWebviewScrollUntilRef.current =
                                Date.now() + WEBVIEW_SCROLL_SUPPRESS_MS;
                            container.scrollTop = nextScrollTop;
                        }
                        break;
                    }
                    case 'EXPAND_INTERVENTION_DETAIL':
                        // [Why/Intent] ホバーまたは掲示板・フローティングバーの「詳細」押下時にバッチング遅延なく即座に該当IDの詳細＆チャットペインを右隣へ展開する（RULE-007）
                        flushSync(() => {
                            setSelectedDetail(message.payload.detail);
                            setPersonaId(message.payload.persona);
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
                        if (
                            'scrollSyncEnabled' in message &&
                            typeof message.scrollSyncEnabled === 'boolean'
                        ) {
                            scrollSyncEnabledRef.current =
                                message.scrollSyncEnabled;
                            setScrollSyncEnabled(message.scrollSyncEnabled);
                        }
                        if (
                            'editorFontSize' in message &&
                            typeof message.editorFontSize === 'number' &&
                            message.editorFontSize > 0
                        ) {
                            setEditorFontSize(message.editorFontSize);
                        }
                        if (
                            'editorLineHeight' in message &&
                            typeof message.editorLineHeight === 'number' &&
                            message.editorLineHeight > 0
                        ) {
                            setEditorLineHeight(message.editorLineHeight);
                        }
                        break;
                    case 'NAVIGATE_TO_SETTINGS':
                        setSelectedDetail(null);
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
     * [Why/Intent] エディタとサイドバー間の双方向スクロール同期設定を更新し、
     * ExtensionへUPDATE_QUICK_SETTINGSメッセージを送信してVS Code設定（scrollSync）へ永続化する。
     */
    const handleScrollSyncChange = (enabled: boolean) => {
        scrollSyncEnabledRef.current = enabled;
        setScrollSyncEnabled(enabled);
        lastSentTopLineRef.current = null;
        vscode.postMessage({
            type: 'UPDATE_QUICK_SETTINGS',
            payload: { scrollSyncEnabled: enabled },
        });
    };

    /**
     * [Why/Intent] ユーザーがサイドバー側で手動操作を開始した際、
     * エディタ追従由来のスクロール抑止ロックを即座に解除し応答遅延をなくす。
     */
    const handleManualScrollIntent = () => {
        suppressWebviewScrollUntilRef.current = 0;
    };

    /**
     * [Why/Intent] サイドバーのスクロール位置を現在先頭のコード行番号へ変換し、
     * rAFスロットリング付きでExtension（左エディタ）へ同期送信する。
     */
    const handleSidebarScroll = () => {
        if (!scrollSyncEnabledRef.current) {
            return;
        }
        if (Date.now() < suppressWebviewScrollUntilRef.current) {
            return;
        }
        if (scrollRafIdRef.current !== null) {
            return;
        }
        scrollRafIdRef.current = window.requestAnimationFrame(() => {
            scrollRafIdRef.current = null;
            if (!scrollSyncEnabledRef.current) {
                return;
            }
            if (Date.now() < suppressWebviewScrollUntilRef.current) {
                return;
            }
            const container = sidebarContainerRef.current;
            if (!container) {
                return;
            }
            const topLine = findTopVisibleLine(container);
            if (topLine === null || topLine === lastSentTopLineRef.current) {
                return;
            }
            lastSentTopLineRef.current = topLine;
            vscode.postMessage({
                type: 'SYNC_WEBVIEW_SCROLL',
                payload: { topLine },
            });
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
        vscode.postMessage({
            type: 'SET_DETAIL_PANEL_OPEN',
            payload: { isOpen: true },
        });
        vscode.postMessage({
            type: 'REQUEST_EXPAND_DETAIL',
            payload: { interventionId: id },
        });
    };

    /**
     * [Why/Intent] 右側の詳細＆チャットペインを閉じ、サイドバー幅を元のサイズへ復元するハンドラ。
     */
    const handleCloseDetail = () => {
        setSelectedDetail(null);
        setRefineError(null);
        vscode.postMessage({
            type: 'SET_DETAIL_PANEL_OPEN',
            payload: { isOpen: false },
        });
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

    const isDetailOpen = selectedDetail !== null;

    const layoutStyle: CSSProperties & Record<string, string | number | undefined> =
        {
            ...(editorFontSize !== undefined
                ? { '--vce-editor-font-size': `${editorFontSize}px` }
                : {}),
            ...(editorLineHeight !== undefined
                ? { '--vce-editor-line-height': `${editorLineHeight}px` }
                : {}),
        };

    return (
        <div
            data-testid="sidebar-split-layout"
            className={`sidebar-container sidebar-split-layout${isDetailOpen ? ' is-detail-open' : ''}`}
            style={layoutStyle}
        >
            {/* 左ペイン（全体3ラインの中央）：AI作業コード＆介入掲示板（常時表示・スクロール同期対象） */}
            <div
                ref={sidebarContainerRef}
                className="sidebar-workspace-pane"
                data-testid="sidebar-scroll-container"
                onScroll={handleSidebarScroll}
                onWheel={handleManualScrollIntent}
                onPointerDown={handleManualScrollIntent}
                onTouchStart={handleManualScrollIntent}
            >
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
                    scrollSyncEnabled={scrollSyncEnabled}
                    onScrollSyncChange={handleScrollSyncChange}
                />
            </div>

            {/* 右ペイン（全体3ラインの右端）：「詳細」押下時のみ一時展開される before/after ＋ AIチャット画面 */}
            {selectedDetail && (
                <div
                    className="sidebar-detail-pane"
                    data-testid="sidebar-detail-pane"
                >
                    <SidebarDialogueView
                        detail={selectedDetail}
                        onBack={handleCloseDetail}
                        closeButtonLabel="✕ 詳細を閉じる"
                        onRefine={handleRefine}
                        isRefining={isRefining}
                        refineError={refineError}
                        onSendMessage={handleSendMessage}
                        isChatLoading={isChatLoading}
                        onApply={handleApply}
                        onUndo={handleUndo}
                        onReject={handleReject}
                    />
                </div>
            )}
        </div>
    );
}

export default App;

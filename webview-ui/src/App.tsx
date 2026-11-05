/**
 * [Why/Intent] Side-by-SideエディタのReact側ルートコンポーネントであり、
 * Extensionからのイベントを購読して状態（ドキュメント内容・提案一覧・各種設定）を管理・分配する責務を持つ。
 * 学習支援、ダッシュボード、AI推論デバッグの各タブは破壊（撤去）され、CodeとSettingsの2タブ構成で動作する。
 */
import { useEffect, useState } from 'react';
import type { ExtensionToWebviewMessage, WebviewIntervention, AiInterventionLevel } from './types';
import { TabBar, type TabType } from './components/TabBar';
import { MirrorEditor } from './components/MirrorEditor';
import { SettingsPanel } from './components/SettingsPanel';

import { vscode } from './utils/vscode';

/**
 * [Why/Intent] メインアプリケーションコンポーネント。
 * エディタ同期、提案反映・破棄、設定更新の各イベントを管理する。
 */
function App() {
    /**
     * [Why/Intent] Extensionから受信したドキュメント名・テキスト内容・提案一覧を保持・描画するため。
     */
    const [fileName, setFileName] = useState<string>('');
    const [text, setText] = useState<string>('');
    const [interventions, setInterventions] = useState<WebviewIntervention[]>([]);
    
    /**
     * [Why/Intent] ユーザーが閲覧している現在のタブ状態（'code' または 'settings'）。
     */
    const [activeTab, setActiveTab] = useState<TabType>('code');

    /**
     * [Why/Intent] APIキーはセキュリティ上Webviewには送信せず、設定の有無（boolean）のみを保持してUIを切り替えるため。
     */
    const [hasApiKey, setHasApiKey] = useState<boolean>(false);
    const [apiKeyLength, setApiKeyLength] = useState<number>(0);

    /**
     * [Why/Intent] ユーザーが選択中のAI推敲レベル。
     */
    const [aiInterventionLevel, setAiInterventionLevel] = useState<AiInterventionLevel>('Level 2 (Refactoring)');

    const [llmFrequency, setLlmFrequency] = useState<'manual' | 'onSave' | 'interval'>('onSave');
    const [llmIntervalSeconds, setLlmIntervalSeconds] = useState<number>(10);
    const [llmModel, setLlmModel] = useState<string>('gemini-3.5-flash-lite');

    /**
     * [Why/Intent] コンポーネントマウント時にメッセージリスナーを登録し、
     * アンマウント時に解除することでメモリリークを防ぎ、Extensionとの通信を維持する。
     */
    useEffect(() => {
        const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage | { type: 'SYNC_SESSION_STATE' }>) => {
            const message = event.data;
            if (!message || typeof message !== 'object') {
                return;
            }
            if ('type' in message && message.type === 'SYNC_SESSION_STATE') {
                // 学習支援タブが破壊されたため、セッション状態の描画は行わない
                return;
            }
            switch (message.type) {
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
                case 'LLM_STATUS_UPDATE':
                case 'LLM_RESPONSE_UPDATE':
                case 'LLM_ERROR_LOG':
                case 'LLM_DASHBOARD_INIT':
                    // ダッシュボードおよび推論タブが破壊されたため、UIへの描画は行わない
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ command: 'ready' });
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    /**
     * [Why/Intent] 提案された推敲をユーザーが反映（適用）する際のハンドラ。
     */
    const handleApply = (intervention: WebviewIntervention) => {
        vscode.postMessage({
            command: 'apply_intervention',
            id: intervention.id,
            newText: intervention.replacementText,
            range: intervention.range
        });
    };

    /**
     * [Why/Intent] 提案された推敲をユーザーが破棄する際のハンドラ。
     */
    const handleDiscard = (id: string) => {
        vscode.postMessage({
            command: 'discard_intervention',
            id
        });
    };

    /**
     * [Why/Intent] APIキーが更新された際に、Extension側（SecretStorage）に保存させるためのハンドラ。
     */
    const handleUpdateApiKey = (key: string) => {
        vscode.postMessage({
            command: 'update_api_key',
            apiKey: key
        });
    };

    /**
     * [Why/Intent] 推敲レベルが変更された際にExtension側の設定を更新するハンドラ。
     * Extension側からの再同期を待つとUIの反応が遅れるため、楽観的UI更新（Optimistic update）を行う。
     */
    const handleUpdateLevel = (level: AiInterventionLevel) => {
        vscode.postMessage({
            command: 'update_intervention_level',
            level
        });
        setAiInterventionLevel(level); // Optimistic update
    };

    /**
     * [Why/Intent] ユーザーの任意のタイミングで推敲を強制再実行させるためのハンドラ。
     */
    const handleForceAnalyze = () => {
        vscode.postMessage({ command: 'force_analyze' });
    };

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            
            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                {activeTab === 'code' && (
                    !fileName ? (
                        <div style={{ padding: '20px', color: 'var(--vscode-editor-foreground)', fontFamily: 'sans-serif' }}>
                            Waiting for document sync...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ 
                                padding: '8px 16px', 
                                backgroundColor: 'var(--vscode-editorGroupHeader-tabsBackground)',
                                borderBottom: '1px solid var(--vscode-editorGroupHeader-tabsBorder)',
                                color: 'var(--vscode-tab-activeForeground)',
                                fontFamily: 'sans-serif',
                                fontSize: '13px'
                            }}>
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
                    )
                )}
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

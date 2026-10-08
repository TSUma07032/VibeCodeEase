import { useState, useCallback, useEffect } from 'react';
import './App.css';
import { CenterPane } from './components/CenterPane';
import { RightPane } from './components/RightPane';
import type { Proposal, Settings } from './types/index';
import { getVSCodeAPI } from './vscode';
import { useVSCodeMessage } from './hooks/useVSCodeMessage';

// [INTENT: サイドバー内にマウントされるReactのルートコンポーネント。未来のAIはUIの基本レイアウトを壊してはならない。]
export default function App() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [settings, setSettings] = useState<Settings>({
    triggerMode: 'on-save',
    personalizationTrend: 'Standard mode. Adapting to user...',
    llmApiKey: ''
  });
  
  const [currentSyncCode, setCurrentSyncCode] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Send initial ready signal
  useEffect(() => {
    getVSCodeAPI().postMessage({ command: 'webviewReady' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messageHandlers = {
    onStageUpdate: useCallback((stage: string) => {
      setCurrentStage(stage);
      setIsProcessing(true);
    }, []),
    onProposalsComplete: useCallback((newProposals: Proposal[]) => {
      setProposals(prev => [...prev, ...newProposals]);
      setIsProcessing(false);
      setCurrentStage('');
    }, []),
    onPersonalizationUpdated: useCallback((trend: string) => {
      setSettings(prev => ({ ...prev, personalizationTrend: trend }));
    }, []),
    onError: useCallback((error: string) => {
      setIsProcessing(false);
      setCurrentStage('');
      setErrorMsg(error);
    }, []),
    onLoadSettings: useCallback((loadedSettings: Partial<Settings>) => {
      setSettings(prev => ({ ...prev, ...loadedSettings }));
    }, []),
    onCodeSynced: useCallback((data: { code: string; uri?: string }) => {
      // [INTENT: 「ユーザが作業中のコードをAI環境に反映する」機能。同期されたコードを保存。]
      setCurrentSyncCode(data.code);
      setErrorMsg(null);
    }, [])
  };

  useVSCodeMessage(messageHandlers);

  const handleSyncClick = () => {
    // [INTENT: ユーザー手動による同期ボタン押下イベント。未来のAIはこれを削除しない。]
    getVSCodeAPI().postMessage({ command: 'syncCurrentCode' });
  };

  return (
    <div className="app-container">
      <div className="sidebar-header">
        <h2>AI Workspace</h2>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button onClick={handleSyncClick} title="Sync Current Editor Code">🔄 Sync</button>
          <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="Settings">⚙️</button>
        </div>
      </div>
      
      {errorMsg && (
        <div className="error-toast">
          <span>❌ Error: {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}>Dismiss</button>
        </div>
      )}

      {isSettingsOpen && (
        <RightPane 
          isOpen={isSettingsOpen} 
          settings={settings} 
          onSettingsChange={setSettings} 
          onToggle={() => setIsSettingsOpen(false)} 
        />
      )}

      <CenterPane 
        proposals={proposals}
        currentSyncCode={currentSyncCode}
        currentStage={currentStage}
        isProcessing={isProcessing}
        onAccept={(p) => getVSCodeAPI().postMessage({ command: 'acceptProposal', proposal: p, codeBefore: currentSyncCode })}
        onDismiss={(id) => setProposals(prev => prev.filter(p => p.id !== id))}
      />
    </div>
  );
}

import { useState, useCallback, useEffect } from 'react';
import './App.css';
import { CenterPane } from './components/CenterPane';
import { RightPane } from './components/RightPane';
import type { Proposal, Settings } from './types/index';
import { getVSCodeAPI } from './vscode';
import { useVSCodeMessage } from './hooks/useVSCodeMessage';

export default function App() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [settings, setSettings] = useState<Settings>({
    interventionLevel: 50,
    personalizationTrend: 'Standard mode. Adapting to user...',
    llmApiKey: ''
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Send initial settings
  useEffect(() => {
    getVSCodeAPI().postMessage({ command: 'updateSettings', settings });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messageHandlers = {
    onStageUpdate: useCallback((stage: string) => {
      setIsProcessing(true);
      setCurrentStage(stage);
      setErrorMsg(null);
    }, []),
    onProposalsComplete: useCallback((newProposals: Proposal[]) => {
      setIsProcessing(false);
      setCurrentStage('');
      setProposals((prev) => [...newProposals, ...prev]);
    }, []),
    onPersonalizationUpdated: useCallback((trend: string) => {
      setSettings((prev) => ({ ...prev, personalizationTrend: trend }));
    }, []),
    onError: useCallback((error: string) => {
      setIsProcessing(false);
      setCurrentStage('');
      setErrorMsg(error);
    }, [])
  };

  useVSCodeMessage(messageHandlers);

  const handleAcceptProposal = useCallback((id: string) => {
    setProposals((prev) => {
      const acceptedProposal = prev.find(p => p.id === id);
      if (acceptedProposal) {
        getVSCodeAPI().postMessage({ 
          command: 'acceptProposal', 
          proposal: acceptedProposal 
        });
      }
      return prev.map(p => p.id === id ? { ...p, status: 'accepted' } : p);
    });
  }, []);

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    getVSCodeAPI().postMessage({ command: 'updateSettings', settings: newSettings });
  }, []);

  const handleForceAnalyze = useCallback(() => {
    getVSCodeAPI().postMessage({ command: 'forceAnalyze', code: '', documentUri: '' });
  }, []);

  return (
    <div className="app-container">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {errorMsg && (
          <div className="error-toast" onClick={() => setErrorMsg(null)} style={{ margin: '10px 20px 0 20px' }}>
            ❌ Error: {errorMsg}
          </div>
        )}
        <CenterPane 
          proposals={proposals} 
          isProcessing={isProcessing} 
          currentStage={currentStage} 
          onAccept={handleAcceptProposal} 
          onForceAnalyze={handleForceAnalyze}
        />
      </div>
      {!isSettingsOpen && (
        <button 
          className="settings-toggle-btn"
          onClick={() => setIsSettingsOpen(true)}
        >
          ⚙️ Settings
        </button>
      )}
      <RightPane 
        isOpen={isSettingsOpen} 
        settings={settings} 
        onSettingsChange={handleSettingsChange} 
        onToggle={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}

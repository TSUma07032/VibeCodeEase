import { useState, useEffect } from 'react';
import './App.css';
import { CenterPane } from './components/CenterPane';
import { RightPane } from './components/RightPane';
import type { Proposal, Settings } from './types/index';
import { getVSCodeAPI } from './vscode';

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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'aiStageUpdate') {
        setIsProcessing(true);
        setCurrentStage(message.data.stage);
      } else if (message.command === 'aiProposalsComplete') {
        setIsProcessing(false);
        setCurrentStage('');
        setProposals((prev) => [...message.data.proposals, ...prev]);
      } else if (message.command === 'personalizationUpdated') {
        setSettings((prev) => ({ ...prev, personalizationTrend: message.data.trend }));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleAcceptProposal = (id: string) => {
    setProposals((prev) =>
      prev.map(p => p.id === id ? { ...p, status: 'accepted' } : p)
    );
    const acceptedProposal = proposals.find(p => p.id === id);
    if (acceptedProposal) {
      getVSCodeAPI().postMessage({ command: 'acceptProposal', proposal: acceptedProposal, codeBefore: acceptedProposal.originalText });
    }
  };

  const handleSettingsChange = (newSettings: Settings) => {
    setSettings(newSettings);
    // Optionally notify backend about API key or level changes
    getVSCodeAPI().postMessage({ command: 'updateSettings', settings: newSettings });
  };

  return (
    <div className="app-container">
      <CenterPane 
        proposals={proposals} 
        isProcessing={isProcessing} 
        currentStage={currentStage} 
        onAccept={handleAcceptProposal} 
      />
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


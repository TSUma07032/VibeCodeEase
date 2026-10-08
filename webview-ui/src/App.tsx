import { useState, useEffect } from 'react';
import { PersonalizationPanel } from './components/PersonalizationPanel';
import './App.css';

// VS Code API を取得するための宣言
declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
function App() {
  // LLM / API Key State
  const [llmConfig, setLlmConfig] = useState<any>({ provider: 'gemini', model: 'gemini-3.6-flash' });
  const [hasGeminiApiKey, setHasGeminiApiKey] = useState<boolean>(false);

  // Personalization State
  const [pzProfile, setPzProfile] = useState<any>(null);
  const [pzMetrics, setPzMetrics] = useState<any>(null);
  const [pzCandidates, setPzCandidates] = useState<any[]>([]);
  const [pzBusy, setPzBusy] = useState<boolean>(false);
  const [pzError, setPzError] = useState<string>('');
  useEffect(() => {
    // 起動時に拡張機能へ設定取得リクエストを送る
    vscode?.postMessage({ command: 'GET_SETTINGS' });

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'SETTINGS_DATA': {
          const payload = data.payload as any;
          if (payload.llmConfig) setLlmConfig(payload.llmConfig);
          if (payload.hasGeminiApiKey !== undefined) setHasGeminiApiKey(payload.hasGeminiApiKey);
          break;
        }

        case 'PZ_STATE':
          setPzProfile(data.payload.profile);
          setPzMetrics(data.payload.metrics);
          break;
        case 'PZ_CANDIDATES':
          setPzCandidates(data.payload);
          break;
        case 'PZ_BUSY':
          setPzBusy(data.payload);
          if (data.payload) setPzError('');
          break;
        case 'PZ_ERROR':
          setPzError(data.payload);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="App">
      <header className="header">
        <h1>✨ vibeCodeEase</h1>
        <p>AI-assisted Flow & Learning Support</p>
      </header>

      <PersonalizationPanel 
        vscode={vscode} 
        profile={pzProfile} 
        metrics={pzMetrics} 
        candidates={pzCandidates} 
        isBusy={pzBusy} 
        error={pzError} 
        llmConfig={llmConfig}
        hasGeminiApiKey={hasGeminiApiKey}
        onUpdateLlmConfig={(provider, model) => {
          setLlmConfig({ provider: provider as any, model });
          vscode?.postMessage({ command: 'SET_LLM_CONFIG', payload: { provider, model } });
        }}
        onSaveApiKey={(apiKey) => {
          vscode?.postMessage({ command: 'SAVE_API_KEY', payload: { apiKey } });
        }}
        onDeleteApiKey={() => {
          vscode?.postMessage({ command: 'DELETE_API_KEY' });
        }}
      />
    </div>
  );
}

export default App;





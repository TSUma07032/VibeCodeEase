
import './App.css';
import { useEffect, useState } from 'react';

// VS Code API を取得するための宣言
declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

interface ProposedEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  newText: string;
  category: string;
  reason: string;
}

interface InterventionPlan {
  summary: string;
  edits: ProposedEdit[];
}

function App() {
  const [plan, setPlan] = useState<InterventionPlan | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ type: string; payload?: InterventionPlan | string }>) => {
      switch (event.data.type) {
        case 'ANALYSIS_STARTED':
          setStatus('ファイルを解析しています...');
          setPlan(null);
          break;
        case 'INTERVENTION_PLAN':
          setPlan(event.data.payload as InterventionPlan);
          setStatus('');
          break;
        case 'PLAN_APPLIED':
          setPlan(null);
          setStatus('変更を適用しました。');
          break;
        case 'PLAN_REJECTED':
          setPlan(null);
          setStatus('提案を却下しました。');
          break;
        case 'ERROR':
          setStatus(event.data.payload as string);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleAnalyze = () => {
    if (vscode) {
      vscode.postMessage({ command: 'ANALYZE_CURRENT_FILE' });
    } else {
      setStatus('VS Code APIを利用できません。');
    }
  };

  const handleApply = () => vscode?.postMessage({ command: 'APPLY_PLAN' });
  const handleReject = () => vscode?.postMessage({ command: 'REJECT_PLAN' });

  return (
    <div className="App">
      <h1>vibeCodeEase Settings</h1>
      <button onClick={handleAnalyze}>現在のファイルを解析</button>
      {status && <p role="status">{status}</p>}
      {plan && (
        <section aria-label="介入プラン">
          <h2>介入プラン</h2>
          <p>{plan.summary}</p>
          <ul>
            {plan.edits.map((edit, index) => (
              <li key={`${edit.startLine}-${edit.startCharacter}-${index}`}>
                <strong>{edit.category}</strong>: {edit.reason}
                <pre>{edit.newText}</pre>
              </li>
            ))}
          </ul>
          <button onClick={handleApply} disabled={plan.edits.length === 0}>承認して変更</button>
          <button onClick={handleReject}>却下</button>
        </section>
      )}
    </div>
  );
}

export default App;

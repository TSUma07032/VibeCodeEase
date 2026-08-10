
import './App.css';

// VS Code API を取得するための宣言
declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

function App() {
  const handleUpdatePreference = () => {
    if (vscode) {
      vscode.postMessage({
        command: 'UPDATE_PREFERENCE',
        data: { message: 'Hello from Webview UI!' }
      });
    } else {
      console.log('VS Code API is not available.');
    }
  };

  return (
    <div className="App">
      <h1>vibeCodeEase Settings</h1>
      <p>Configure your pain matrix here.</p>
      <button onClick={handleUpdatePreference}>
        Send UPDATE_PREFERENCE
      </button>
    </div>
  );
}

export default App;

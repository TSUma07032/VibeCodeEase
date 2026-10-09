/**
 * [Why/Intent] Side-by-SideエディタのReact側ルートコンポーネントであり、
 * Extensionからのイベントを購読して状態（ドキュメント内容・提案一覧）を管理・分配する責務を持つ。
 */
import { useEffect, useState } from 'react';
import type { ExtensionToWebviewMessage, WebviewIntervention } from './types';
import { MirrorEditor } from './components/MirrorEditor';

/**
 * [Why/Intent] ブラウザ単体での開発・デバッグ時に acquireVsCodeApi が存在しなくてもクラッシュさせないためのフォールバックモック。
 */
const vscode = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : {
    postMessage: (msg: any) => console.log('postMessage:', msg)
};

function App() {
    /**
     * [Why/Intent] Extensionから受信したドキュメント名・テキスト内容・提案一覧を保持・描画するため。
     */
    const [fileName, setFileName] = useState<string>('');
    const [text, setText] = useState<string>('');
    const [interventions, setInterventions] = useState<WebviewIntervention[]>([]);

    /**
     * [Why/Intent] コンポーネントマウント時にメッセージリスナーを登録し、
     * アンマウント時に解除することでメモリリークを防ぎ、Extensionとの通信を維持する。
     */
    useEffect(() => {
        const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
            const message = event.data;
            switch (message.type) {
                case 'SYNC_DOCUMENT':
                    setFileName(message.fileName);
                    setText(message.text);
                    break;
                case 'UPDATE_INTERVENTIONS':
                    setInterventions(message.interventions);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ command: 'ready' });
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleApply = (intervention: WebviewIntervention) => {
        vscode.postMessage({
            command: 'apply_intervention',
            id: intervention.id,
            newText: intervention.replacementText,
            range: intervention.range
        });
    };

    const handleDiscard = (id: string) => {
        vscode.postMessage({
            command: 'discard_intervention',
            id
        });
    };

    if (!fileName) {
        return (
            <div style={{ padding: '20px', color: 'var(--vscode-editor-foreground)', fontFamily: 'sans-serif' }}>
                Waiting for document sync...
            </div>
        );
    }

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
    );
}

export default App;

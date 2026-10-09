/**
 * [Why/Intent] VS Code APIを取得するロジックを分離。
 * ブラウザ単体での開発・デバッグ時に acquireVsCodeApi が存在しなくてもクラッシュさせないためのフォールバックモックも提供する。
 */
export const vscode = (window as any).acquireVsCodeApi 
    ? (window as any).acquireVsCodeApi() 
    : { postMessage: (msg: any) => console.log('postMessage:', msg) };

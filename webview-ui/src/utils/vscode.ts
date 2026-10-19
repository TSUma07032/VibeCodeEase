/**
 * [Why/Intent] VS Code APIを取得するロジックを分離。
 * ブラウザ単体での開発・デバッグ時に acquireVsCodeApi が存在しなくてもクラッシュさせないためのフォールバックモックも提供する。
 */
export interface VsCodeApi {
    postMessage: (msg: unknown) => void;
    getState?: () => unknown;
    setState?: (state: unknown) => void;
}

declare global {
    interface Window {
        acquireVsCodeApi?: () => VsCodeApi;
    }
}

export const vscode: VsCodeApi = typeof window !== 'undefined' && window.acquireVsCodeApi
    ? window.acquireVsCodeApi()
    : { postMessage: (msg: unknown) => console.log('postMessage:', msg) };

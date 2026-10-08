export function getVSCodeAPI() {
  if (typeof (window as any).vscodeAPI === 'undefined') {
    if (typeof (window as any).acquireVsCodeApi === 'function') {
      (window as any).vscodeAPI = (window as any).acquireVsCodeApi();
    } else {
      // Mock for browser testing
      (window as any).vscodeAPI = {
        postMessage: (message: any) => console.log('Mock postMessage:', message)
      };
    }
  }
  return (window as any).vscodeAPI;
}

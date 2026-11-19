import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import type { VsCodeApi } from '../utils/vscode';

export const mockPostMessage = vi.fn();

// acquireVsCodeApi のグローバルモック
const globalWithVsCode = globalThis as typeof globalThis & { acquireVsCodeApi?: () => VsCodeApi };
globalWithVsCode.acquireVsCodeApi = () => ({
  postMessage: mockPostMessage,
  getState: vi.fn(),
  setState: vi.fn()
});

afterEach(() => {
  cleanup();
  mockPostMessage.mockClear();
});

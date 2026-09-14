import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

export const mockPostMessage = vi.fn();

// acquireVsCodeApi のグローバルモック
(globalThis as any).acquireVsCodeApi = () => ({
  postMessage: mockPostMessage,
  getState: vi.fn(),
  setState: vi.fn()
});

afterEach(() => {
  cleanup();
  mockPostMessage.mockClear();
});

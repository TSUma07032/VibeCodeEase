import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardPanel } from './DashboardPanel';
import { mockPostMessage } from '../test/setup';

describe('DashboardPanel Component', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
  });

  it('renders idle status and empty response placeholder when response is null', () => {
    render(<DashboardPanel status="idle" response={null} logs={[]} />);
    expect(screen.getByText('⚪ 待機中')).toBeInTheDocument();
    expect(screen.getByText('まだ解析結果はありません。')).toBeInTheDocument();
  });

  it('renders markdown response preserving TypeScript generic syntax <T> and handles manual analyze and copy', () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(
      <DashboardPanel
        status="loading"
        response={{ text: 'Use `Array<T>` and `Promise<Result>` for type safety.', timestamp: 1000 }}
        logs={[]}
      />
    );

    expect(screen.getByText('⏳ 解析中')).toBeInTheDocument();
    expect(screen.getByText('Array<T>')).toBeInTheDocument();
    expect(screen.getByText('Promise<Result>')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: /Copy/ });
    fireEvent.click(copyBtn);
    expect(screen.getByText('✅ Copied!')).toBeInTheDocument();
  });

  it('switches to Error Log view, displays logs, and sends clear_error_logs', () => {
    render(
      <DashboardPanel
        status="error"
        response={null}
        logs={[{ message: 'API Rate Limit 429', timestamp: 1700000000000 }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Error Log' }));
    expect(screen.getByText('API Rate Limit 429')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /Clear/ });
    fireEvent.click(clearBtn);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'clear_error_logs' });
  });
});

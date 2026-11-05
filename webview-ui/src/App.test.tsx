/**
 * [Why/Intent] App ルートコンポーネントの統合単体テストスイート。
 * 廃止された旧TabBar・MirrorEditor・旧SettingsPanelの非存在検証、
 * 初期画面（SidebarInitialView）から対話パネル（SidebarDialogueView）への画面遷移（sidebarMode）、
 * 各種IPCメッセージ（SYNC_SETTINGS, SYNC_HISTORY_STATE, EXPAND_INTERVENTION_DETAIL, NAVIGATE_TO_SETTINGS 等）の送受信を検証する。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { MirrorEditor } from './components/MirrorEditor';
import { ProposalPopup } from './components/ProposalPopup';
import { mockPostMessage } from './test/setup';
import type { WebviewIntervention } from './types';

describe('App Component', () => {
    it('初期マウント時に ready メッセージを送信し、初期画面（SidebarInitialView）を描画すること', () => {
        render(<App />);
        expect(mockPostMessage).toHaveBeenCalledWith({ command: 'ready' });
        expect(screen.getByTestId('sidebar-initial-view')).toBeInTheDocument();
        expect(screen.getByText('⚡ 簡易設定')).toBeInTheDocument();
        expect(screen.getByText('🔑 Gemini API Key')).toBeInTheDocument();
    });

    it('SYNC_SETTINGS 受信時に簡易設定およびAPIキー状態が更新されること', () => {
        render(<App />);
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'SYNC_SETTINGS',
                        hasApiKey: true,
                        apiKeyLength: 39,
                        frequency: 'interval',
                        intervalSeconds: 60,
                        model: 'gemini-3.8-flash',
                        personaId: 'concise',
                    },
                }),
            );
        });

        expect(screen.getByText(/設定済/i)).toBeInTheDocument();
    });

    it('SYNC_HISTORY_STATE 受信時に提案リストが描画され、アイテムクリックで SidebarDialogueView へ遷移すること', () => {
        render(<App />);
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'SYNC_HISTORY_STATE',
                        payload: {
                            documentUri: 'file:///workspace/src/demo.ts',
                            interventions: [
                                {
                                    id: 'int-1',
                                    title: '不要な再計算のメモ化',
                                    summary: 'useMemoを使用します',
                                    range: {
                                        start: { line: 0, character: 0 },
                                        end: { line: 5, character: 0 },
                                    },
                                    status: 'pending',
                                    personaId: 'mentor',
                                    createdAt: '2026-11-05T00:00:00Z',
                                    updatedAt: '2026-11-05T00:00:00Z',
                                },
                            ],
                        },
                    },
                }),
            );
        });

        expect(screen.getByText('不要な再計算のメモ化')).toBeInTheDocument();

        // アイテムをクリックして対話画面へ遷移
        fireEvent.click(screen.getByText('不要な再計算のメモ化'));

        expect(mockPostMessage).toHaveBeenCalledWith({
            type: 'REQUEST_EXPAND_DETAIL',
            payload: { interventionId: 'int-1' },
        });
        expect(screen.getByTestId('sidebar-dialogue-view')).toBeInTheDocument();
    });

    it('EXPAND_INTERVENTION_DETAIL 受信時に SidebarDialogueView へ切り替わり詳細が描画されること', () => {
        render(<App />);
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'EXPAND_INTERVENTION_DETAIL',
                        payload: {
                            interventionId: 'int-on-demand',
                            persona: 'concise',
                            detail: {
                                id: 'int-on-demand',
                                title: 'On Demand Refactoring',
                                summary: 'Refactor something',
                                range: {
                                    start: { line: 0, character: 0 },
                                    end: { line: 0, character: 10 },
                                },
                                status: 'pending',
                                personaId: 'concise',
                                originalCode: 'const a = 1;',
                                proposedCode: 'const a = 2;',
                                createdAt: '2026-11-05T00:00:00Z',
                                updatedAt: '2026-11-05T00:00:00Z',
                                chatHistory: [],
                            },
                        },
                    },
                }),
            );
        });

        expect(screen.getByTestId('sidebar-dialogue-view')).toBeInTheDocument();
        expect(screen.getByText('On Demand Refactoring')).toBeInTheDocument();
        expect(screen.getByText('Refactor something')).toBeInTheDocument();
    });

    it('SidebarDialogueView から「⬅️ 一覧・簡易設定に戻る」ボタン押下で SidebarInitialView へ復帰すること', () => {
        render(<App />);
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'EXPAND_INTERVENTION_DETAIL',
                        payload: {
                            interventionId: 'int-on-demand',
                            persona: 'mentor',
                            detail: {
                                id: 'int-on-demand',
                                title: 'On Demand Refactoring',
                                summary: 'Refactor something',
                                range: {
                                    start: { line: 0, character: 0 },
                                    end: { line: 0, character: 10 },
                                },
                                status: 'pending',
                                personaId: 'mentor',
                                originalCode: 'const a = 1;',
                                proposedCode: 'const a = 2;',
                                createdAt: '2026-11-05T00:00:00Z',
                                updatedAt: '2026-11-05T00:00:00Z',
                                chatHistory: [],
                            },
                        },
                    },
                }),
            );
        });

        expect(screen.getByTestId('sidebar-dialogue-view')).toBeInTheDocument();

        // 戻るボタンを押下
        fireEvent.click(
            screen.getByRole('button', { name: /一覧・簡易設定に戻る/i }),
        );

        expect(screen.getByTestId('sidebar-initial-view')).toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-dialogue-view')).toBeNull();
    });

    it('NAVIGATE_TO_SETTINGS 受信時に詳細表示を解除して SidebarInitialView（簡易設定＋APIキー画面）を表示すること', () => {
        render(<App />);
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'EXPAND_INTERVENTION_DETAIL',
                        payload: {
                            interventionId: 'int-on-demand',
                            persona: 'mentor',
                            detail: {
                                id: 'int-on-demand',
                                title: 'On Demand Refactoring',
                                summary: 'Refactor something',
                                range: {
                                    start: { line: 0, character: 0 },
                                    end: { line: 0, character: 10 },
                                },
                                status: 'pending',
                                personaId: 'mentor',
                                originalCode: 'const a = 1;',
                                proposedCode: 'const a = 2;',
                                createdAt: '2026-11-05T00:00:00Z',
                                updatedAt: '2026-11-05T00:00:00Z',
                                chatHistory: [],
                            },
                        },
                    },
                }),
            );
        });

        expect(screen.getByTestId('sidebar-dialogue-view')).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'NAVIGATE_TO_SETTINGS',
                    },
                }),
            );
        });

        expect(screen.getByTestId('sidebar-initial-view')).toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-dialogue-view')).toBeNull();
    });

    it('撤去された旧UI（TabBar、MirrorEditor、旧SettingsPanel）が存在しないこと', () => {
        render(<App />);
        expect(screen.queryByText('[💻 Code]')).toBeNull();
        expect(screen.queryByText('[⚙️ Settings]')).toBeNull();
        expect(screen.queryByText('設定カテゴリ:')).toBeNull();
        expect(screen.queryByText('Waiting for document sync...')).toBeNull();
    });
});

describe('MirrorEditor & ProposalPopup Components', () => {
    const dummyIntervention: WebviewIntervention = {
        id: '123',
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
        },
        originalText: 'const',
        replacementText: 'let',
        message: 'Use let',
    };

    it('renders text with line numbers and handles diff discard inline', () => {
        const onDiscard = vi.fn();
        render(
            <MirrorEditor
                text={'const x = 1;\r\nline 2'}
                interventions={[dummyIntervention]}
                onApply={vi.fn()}
                onDiscard={onDiscard}
            />,
        );
        expect(screen.getByText('line 2')).toBeDefined();

        const discardBtn = screen.getByTestId('diff-discard-btn');
        expect(discardBtn).toHaveTextContent('[破棄]');
        fireEvent.click(discardBtn);
        expect(onDiscard).toHaveBeenCalledWith('123');
    });

    it('renders ProposalPopup diff texts and buttons', () => {
        const onApply = vi.fn();
        const onDiscard = vi.fn();
        render(
            <ProposalPopup
                intervention={dummyIntervention}
                onApply={onApply}
                onDiscard={onDiscard}
            />,
        );

        fireEvent.click(screen.getByText('[反映 (Accept)]'));
        expect(onApply).toHaveBeenCalledWith(dummyIntervention);

        fireEvent.click(screen.getByText('[破棄 (Discard)]'));
        expect(onDiscard).toHaveBeenCalledWith('123');
    });
});

/**
 * [Why/Intent] App ルートコンポーネントの統合単体テストスイート。
 * 廃止された旧TabBar・旧SettingsPanelの非存在検証、
 * 初期画面（SidebarInitialView: 上部「💻 AI作業コード」＋下部「📋 提案・依頼リスト（掲示板）」）から
 * 2番目以降の「詳細」ボタンによる対話パネル（SidebarDialogueView）への画面遷移、
 * 各種IPCメッセージ（SYNC_DOCUMENT, SYNC_SETTINGS, SYNC_HISTORY_STATE, EXPAND_INTERVENTION_DETAIL, NAVIGATE_TO_SETTINGS 等）の送受信を検証する。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { mockPostMessage } from './test/setup';

describe('App Component', () => {
    it('初期マウント時に ready メッセージを送信し、初期画面（上部：AI作業コード、下部：提案・依頼リスト）を描画すること', () => {
        render(<App />);
        expect(mockPostMessage).toHaveBeenCalledWith({ command: 'ready' });
        expect(screen.getByTestId('sidebar-initial-view')).toBeInTheDocument();
        expect(screen.getByTestId('ai-workspace-code')).toBeInTheDocument();
        expect(
            screen.getByTestId('intervention-bulletin-board'),
        ).toBeInTheDocument();
        expect(screen.getByText('💻 AI作業コード')).toBeInTheDocument();
        expect(screen.getByText('📋 提案・依頼リスト')).toBeInTheDocument();
        expect(screen.getByTestId('toggle-settings-btn')).toBeInTheDocument();
    });

    it('SYNC_SETTINGS 受信および「⚙️ 設定」ボタン押下時に簡易設定およびAPIキー状態が表示されること', () => {
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

        fireEvent.click(screen.getByTestId('toggle-settings-btn'));
        expect(screen.getByText('⚡ 簡易設定')).toBeInTheDocument();
        expect(screen.getByText('🔑 Gemini API Key')).toBeInTheDocument();
        expect(screen.getByText(/設定済/i)).toBeInTheDocument();
    });

    it('SYNC_SETTINGS で受け取った editorFontSize と editorLineHeight が CSS カスタムプロパティとして反映されること', () => {
        render(<App />);
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'SYNC_SETTINGS',
                        hasApiKey: true,
                        apiKeyLength: 39,
                        frequency: 'onSave',
                        intervalSeconds: 30,
                        model: 'gemini-3.5-flash-lite',
                        personaId: 'mentor',
                        scrollSyncEnabled: true,
                        editorFontSize: 16,
                        editorLineHeight: 24,
                    },
                }),
            );
        });

        const layout = screen.getByTestId('sidebar-split-layout');
        expect(layout.style.getPropertyValue('--vce-editor-font-size')).toBe(
            '16px',
        );
        expect(layout.style.getPropertyValue('--vce-editor-line-height')).toBe(
            '24px',
        );
    });

    it('SYNC_DOCUMENT と SYNC_HISTORY_STATE 受信時に古い介入はコード右側に非表示、新提案は提案後コードハイライト＋介入ボタン押下で上側フローティングバーが開き、詳細押下で縦3ライン横並び展開されること', () => {
        render(<App />);
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'SYNC_DOCUMENT',
                        fileName: 'c:/workspace/src/demo.ts',
                        text: [
                            'const oldVal = 1;',
                            'const a = calc();',
                            'JSON.parse(raw);',
                        ].join('\n'),
                    },
                }),
            );
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
                                        end: { line: 0, character: 15 },
                                    },
                                    status: 'applied',
                                    personaId: 'mentor',
                                    originalCode: 'var oldVal = 1;',
                                    proposedCode: 'const oldVal = 1;',
                                    createdAt: '2026-11-05T00:00:00Z',
                                    updatedAt: '2026-11-05T00:00:00Z',
                                },
                                {
                                    id: 'int-2',
                                    title: 'エラーハンドリングの追加',
                                    summary: 'try-catchで安全に保護します',
                                    range: {
                                        start: { line: 2, character: 0 },
                                        end: { line: 2, character: 15 },
                                    },
                                    status: 'pending',
                                    personaId: 'mentor',
                                    originalCode: 'JSON.parse(raw);',
                                    proposedCode:
                                        'try { JSON.parse(raw); } catch {}',
                                    createdAt: '2026-11-05T00:01:00Z',
                                    updatedAt: '2026-11-05T00:01:00Z',
                                },
                            ],
                        },
                    },
                }),
            );
        });

        // 古い提案（int-1）はコード右側に表示されないこと
        expect(screen.queryByTestId('workspace-past-icon-int-1')).toBeNull();

        // 新しい提案（int-2）は提案後コードへ置換＋ハイライト表示され、介入2ボタンがあること
        const pendingBtn = screen.getByTestId('workspace-pending-btn-int-2');
        expect(pendingBtn).toHaveTextContent('介入2');

        // 介入2ボタンを押すと上側フローティング簡易バーが開くこと
        fireEvent.click(pendingBtn);
        const popover = screen.getByTestId('workspace-action-popover-int-2');
        expect(popover).toBeInTheDocument();
        expect(popover.getAttribute('data-placement')).toBe('top');

        // 簡易バーの「💬 詳細」ボタンを押すと縦3ライン（AI作業コード＋右隣の詳細＆チャット）へ展開されること
        fireEvent.click(screen.getByTestId('workspace-detail-int-2'));

        expect(mockPostMessage).toHaveBeenCalledWith({
            type: 'SET_DETAIL_PANEL_OPEN',
            payload: { isOpen: true },
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
            type: 'REQUEST_EXPAND_DETAIL',
            payload: { interventionId: 'int-2' },
        });
        expect(screen.getByTestId('sidebar-split-layout')).toHaveClass(
            'is-detail-open',
        );
        // AI作業コードと詳細＆チャットが同時に横並び表示されていること
        expect(screen.getByTestId('sidebar-initial-view')).toBeInTheDocument();
        const dialogueView = screen.getByTestId('sidebar-dialogue-view');
        expect(dialogueView).toBeInTheDocument();
        expect(
            within(dialogueView).getByText('エラーハンドリングの追加'),
        ).toBeInTheDocument();
        expect(
            within(dialogueView).getByText('try-catchで安全に保護します'),
        ).toBeInTheDocument();
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

    it('SidebarDialogueView から「✕ 詳細を閉じる」ボタン押下で右ペインが閉じ、SET_DETAIL_PANEL_OPEN(false) が送信されること', () => {
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
        expect(screen.getByTestId('sidebar-split-layout')).toHaveClass(
            'is-detail-open',
        );

        // 閉じるボタンを押下
        mockPostMessage.mockClear();
        fireEvent.click(screen.getByTestId('close-detail-pane-btn'));

        expect(screen.getByTestId('sidebar-initial-view')).toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-dialogue-view')).toBeNull();
        expect(screen.getByTestId('sidebar-split-layout')).not.toHaveClass(
            'is-detail-open',
        );
        expect(mockPostMessage).toHaveBeenCalledWith({
            type: 'SET_DETAIL_PANEL_OPEN',
            payload: { isOpen: false },
        });
    });

    it('NAVIGATE_TO_SETTINGS 受信時に詳細表示を解除して SidebarInitialView の設定パネルを開いた状態で表示すること', () => {
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
        expect(screen.getByTestId('sidebar-settings-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-dialogue-view')).toBeNull();
    });

    it('撤去された旧UI（TabBar、旧SettingsPanel）が存在しないこと', () => {
        render(<App />);
        expect(screen.queryByText('[💻 Code]')).toBeNull();
        expect(screen.queryByText('[⚙️ Settings]')).toBeNull();
        expect(screen.queryByText('設定カテゴリ:')).toBeNull();
        expect(screen.queryByText('Waiting for document sync...')).toBeNull();
    });

    it('SYNC_EDITOR_SCROLL 受信で対象行へスクロール追従し、直後のエコーバック送信を抑止し、手動スクロールでは SYNC_WEBVIEW_SCROLL を送信すること', () => {
        const rafSpy = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((cb) => {
                cb(0);
                return 1;
            });

        try {
            mockPostMessage.mockClear();
            render(<App />);

            act(() => {
                window.dispatchEvent(
                    new MessageEvent('message', {
                        data: {
                            type: 'SYNC_DOCUMENT',
                            fileName: 'c:/workspace/src/demo.ts',
                            text: ['line 0', 'line 1', 'line 2', 'line 3'].join(
                                '\n',
                            ),
                        },
                    }),
                );
            });

            // 設定パネルを開いた状態でも追従することを合わせて検証
            fireEvent.click(screen.getByTestId('toggle-settings-btn'));
            expect(
                screen.getByTestId('sidebar-settings-panel'),
            ).toBeInTheDocument();

            const container = screen.getByTestId('sidebar-scroll-container');
            container.scrollTop = 0;
            container.getBoundingClientRect = () =>
                ({
                    top: 0,
                    bottom: 400,
                    left: 0,
                    right: 300,
                    width: 300,
                    height: 400,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                }) as DOMRect;

            const lineNodes = container.querySelectorAll<HTMLElement>(
                '[data-workspace-line]',
            );
            lineNodes.forEach((node, idx) => {
                node.getBoundingClientRect = () =>
                    ({
                        top: 200 + idx * 40 - container.scrollTop,
                        bottom: 200 + (idx + 1) * 40 - container.scrollTop,
                        left: 0,
                        right: 300,
                        width: 300,
                        height: 40,
                        x: 0,
                        y: 200 + idx * 40 - container.scrollTop,
                        toJSON: () => ({}),
                    }) as DOMRect;
            });

            // 1. 左エディタ → 右サイドバー追従（line 2 -> scrollTop = 280）
            act(() => {
                window.dispatchEvent(
                    new MessageEvent('message', {
                        data: {
                            type: 'SYNC_EDITOR_SCROLL',
                            topLine: 2,
                        },
                    }),
                );
            });
            expect(container.scrollTop).toBe(280);

            // 直後の scroll イベントはロックにより SYNC_WEBVIEW_SCROLL を送り返さないこと
            mockPostMessage.mockClear();
            fireEvent.scroll(container);
            expect(mockPostMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'SYNC_WEBVIEW_SCROLL' }),
            );

            // 2. ユーザーがホイール操作して line 3 へスクロール → SYNC_WEBVIEW_SCROLL が送信されること
            fireEvent.wheel(container);
            container.scrollTop = 320;
            fireEvent.scroll(container);
            expect(mockPostMessage).toHaveBeenCalledWith({
                type: 'SYNC_WEBVIEW_SCROLL',
                payload: { topLine: 3 },
            });

            // 3. 設定チェックボックスを OFF にすると UPDATE_QUICK_SETTINGS が送られ、以降の同期が止まること
            mockPostMessage.mockClear();
            fireEvent.click(screen.getByTestId('scroll-sync-checkbox'));
            expect(mockPostMessage).toHaveBeenCalledWith({
                type: 'UPDATE_QUICK_SETTINGS',
                payload: { scrollSyncEnabled: false },
            });

            act(() => {
                window.dispatchEvent(
                    new MessageEvent('message', {
                        data: {
                            type: 'SYNC_EDITOR_SCROLL',
                            topLine: 0,
                        },
                    }),
                );
            });
            expect(container.scrollTop).toBe(320);
        } finally {
            rafSpy.mockRestore();
        }
    });
});

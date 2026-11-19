/**
 * [Why/Intent] App ルートコンポーネントの統合単体テストスイート。
 * 廃止された旧TabBar・旧SettingsPanelの非存在検証、
 * 初期画面（SidebarInitialView: 上部「💻 AI作業コード」＋下部「📋 提案・依頼リスト（掲示板）」）から
 * 2番目以降の「詳細」ボタンによる対話パネル（SidebarDialogueView）への画面遷移、
 * 各種IPCメッセージ（SYNC_DOCUMENT, SYNC_SETTINGS, SYNC_HISTORY_STATE, EXPAND_INTERVENTION_DETAIL, NAVIGATE_TO_SETTINGS 等）の送受信を検証する。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

    it('SYNC_DOCUMENT と SYNC_HISTORY_STATE 受信時に上部AI作業コード（新提案インライン＋過去提案ちっちゃいアイコン）と下部掲示板が描画され、2番目の「詳細」で2番目のチャットが開くこと', () => {
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

        // AI作業コード上に、過去の提案（int-1）は右端のちっちゃいアイコン、新しい提案（int-2）はインラインボックスとして表示されること
        expect(
            screen.getByTestId('workspace-past-icon-int-1'),
        ).toHaveTextContent('✓介入1');
        expect(
            screen.getByTestId('workspace-pending-box-int-2'),
        ).toBeInTheDocument();

        // 下部掲示板には過去分も含めて両方並ぶこと
        expect(
            screen.getByText('介入1：不要な再計算のメモ化'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('介入2：エラーハンドリングの追加'),
        ).toBeInTheDocument();

        // 2番目の介入（介入2）をクリックしてトグルを展開
        fireEvent.click(screen.getByTestId('proposal-toggle-int-2'));
        expect(screen.getByTestId('proposal-body-int-2')).toBeInTheDocument();

        // 2番目の「詳細」ボタンをクリックして対話画面へ遷移
        fireEvent.click(screen.getByTestId('proposal-detail-int-2'));

        expect(mockPostMessage).toHaveBeenCalledWith({
            type: 'REQUEST_EXPAND_DETAIL',
            payload: { interventionId: 'int-2' },
        });
        expect(screen.getByTestId('sidebar-dialogue-view')).toBeInTheDocument();
        // 1番目ではなく2番目のタイトル・要約が表示されていること
        expect(
            screen.getByText('エラーハンドリングの追加'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('try-catchで安全に保護します'),
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
});

/**
 * [Why/Intent] SidebarInitialView コンポーネントの単体テストスイート。
 * - 上部「💻 AI作業コード」：内部スクロール枠なしで全面表示され、新しい提案（pending）はコード上にはっきりとインライン表示され、
 *   古い提案（applied / dismissed / reverted）は該当行の右端にちっちゃいアイコンバッジ（✓介入2 等）として並び、
 *   右端のちっちゃいアイコンをクリックすると新提案と同じように「AI作業コード側でも」インライン差分ボックス（workspace-past-box）が開くこと。
 * - 最下部「📋 提案・依頼リスト（介入掲示板）」：過去履歴も含めて「介入1：要約」「介入2：要約」と並び、
 *   クリックでトグル展開（before `- ` / after `+ ` / 採用・却下・詳細）し、
 *   2番目以降の「詳細」ボタンを押した際に該当IDでチャット画面を開くこと（1番目に化けないこと）。
 * - 「⚙️ 設定」ボタンによる簡易設定・APIキー管理パネルの開閉を検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarInitialView } from '../../components/SidebarInitialView';
import type { InterventionItem } from '../../types/onDemandIntervention';

describe('SidebarInitialView Test Suite', () => {
    const mockInterventions: InterventionItem[] = [
        {
            id: 'intv-1',
            title: '不要な再計算のメモ化',
            summary: 'useMemoを使用して重い計算をキャッシュします',
            range: {
                start: { line: 1, character: 0 },
                end: { line: 2, character: 0 },
            },
            status: 'pending',
            personaId: 'mentor',
            originalCode: 'const total = items.reduce((a, b) => a + b, 0);',
            proposedCode:
                'const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);',
            createdAt: '2026-11-05T00:00:00Z',
            updatedAt: '2026-11-05T00:00:00Z',
        },
        {
            id: 'intv-2',
            title: 'null安全チェックの追加',
            summary: 'オプショナルチェイニングを適用します',
            range: {
                start: { line: 3, character: 0 },
                end: { line: 3, character: 20 },
            },
            status: 'applied',
            personaId: 'concise',
            originalCode:
                'const name = user && user.profile && user.profile.name;',
            proposedCode: 'const name = user?.profile?.name;',
            createdAt: '2026-11-05T00:00:00Z',
            updatedAt: '2026-11-05T00:00:00Z',
        },
    ];

    const sampleDocText = [
        'export function Demo({ items, user }) {',
        '  const total = items.reduce((a, b) => a + b, 0);',
        '  console.log(total);',
        '  const name = user?.profile?.name;',
        '  return <div>{name}: {total}</div>;',
        '}',
    ].join('\n');

    it('「⚙️ 設定」ボタンで簡易設定3要素（ペルソナ、介入トリガー、モデル）およびペルソナ説明文が開閉・操作できること', () => {
        const onPersonaChange = vi.fn();
        const onFrequencyChange = vi.fn();
        const onModelChange = vi.fn();

        render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={onPersonaChange}
                frequency="onSave"
                onFrequencyChange={onFrequencyChange}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={onModelChange}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={vi.fn()}
                interventions={mockInterventions}
                documentText={sampleDocText}
                documentFileName="src/Demo.tsx"
                onSelectIntervention={vi.fn()}
            />,
        );

        // 初期状態では設定パネルは閉じている
        expect(screen.queryByTestId('sidebar-settings-panel')).toBeNull();

        // 「⚙️ 設定」ボタンを押して開く
        fireEvent.click(screen.getByTestId('toggle-settings-btn'));
        expect(screen.getByTestId('sidebar-settings-panel')).toBeInTheDocument();

        // ペルソナ選択と説明文
        const personaSelect = screen.getByLabelText(/ペルソナ/i);
        expect(personaSelect).toBeInTheDocument();
        expect(
            screen.getByText(
                /初心者にもわかりやすく変更理由と背景を丁寧に解説します/,
            ),
        ).toBeInTheDocument();
        fireEvent.change(personaSelect, { target: { value: 'concise' } });
        expect(onPersonaChange).toHaveBeenCalledWith('concise');

        // 介入トリガー
        const frequencySelect = screen.getByLabelText(/介入トリガー/i);
        expect(frequencySelect).toBeInTheDocument();
        fireEvent.change(frequencySelect, { target: { value: 'interval' } });
        expect(onFrequencyChange).toHaveBeenCalledWith('interval');

        // モデル選択
        const modelSelect = screen.getByLabelText(/モデル/i);
        expect(modelSelect).toBeInTheDocument();
        fireEvent.change(modelSelect, {
            target: { value: 'gemini-3.8-flash' },
        });
        expect(onModelChange).toHaveBeenCalledWith('gemini-3.8-flash');
    });

    it('APIキー設定状態の表示および変更フォームの保存コールバックが発火すること', () => {
        const onSaveApiKey = vi.fn();

        const { rerender } = render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={false}
                apiKeyLength={0}
                onSaveApiKey={onSaveApiKey}
                interventions={mockInterventions}
                onSelectIntervention={vi.fn()}
                isSettingsOpen={true}
            />,
        );

        expect(screen.getByText(/未設定/i)).toBeInTheDocument();

        // 設定済みの状態で再描画
        rerender(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={onSaveApiKey}
                interventions={mockInterventions}
                onSelectIntervention={vi.fn()}
                isSettingsOpen={true}
            />,
        );

        expect(screen.getByText(/設定済/i)).toBeInTheDocument();

        // 変更ボタンを押して入力
        const changeBtn = screen.getByRole('button', { name: /変更/i });
        fireEvent.click(changeBtn);

        const apiKeyInput = screen.getByPlaceholderText(/Gemini API Key/i);
        fireEvent.change(apiKeyInput, {
            target: { value: 'AIzaSyTestNewKey12345' },
        });

        const saveBtn = screen.getByRole('button', { name: /保存/i });
        fireEvent.click(saveBtn);

        expect(onSaveApiKey).toHaveBeenCalledWith('AIzaSyTestNewKey12345');
    });

    it('AI作業コード上で古い提案は右側に表示されず、新提案は提案後コードへ明るくハイライト置換＋介入ボタン押下でフローティング簡易アクションバーが開き、採用・却下・詳細が機能すること', () => {
        const onSelectIntervention = vi.fn();
        const onApplyIntervention = vi.fn();
        const onRejectIntervention = vi.fn();

        render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={vi.fn()}
                interventions={mockInterventions}
                documentText={sampleDocText}
                documentFileName="src/Demo.tsx"
                onSelectIntervention={onSelectIntervention}
                onApplyIntervention={onApplyIntervention}
                onRejectIntervention={onRejectIntervention}
            />,
        );

        // 1. 全面展開の「💻 AI作業コード」と最下部「📋 提案・依頼リスト」が存在すること
        const workspaceCode = screen.getByTestId('ai-workspace-code');
        expect(workspaceCode).toBeInTheDocument();
        expect(workspaceCode.style.maxHeight).toBe('');
        expect(
            screen.getByTestId('intervention-bulletin-board'),
        ).toBeInTheDocument();

        // 2. 古い提案（intv-2: applied）はコード右側に表示されないこと（要件1）
        expect(
            screen.queryByTestId('workspace-past-icon-intv-2'),
        ).toBeNull();

        // 3. 新しい提案（intv-1: pending）は赤の削除行(-)と緑の追加行(+)としてハイライト表示され、右端に介入1ボタンがあること（要件2）
        const deletionRow = workspaceCode.querySelector(
            '[data-diff-kind="deletion"]',
        );
        const additionRow = workspaceCode.querySelector(
            '[data-diff-kind="addition"]',
        );
        expect(deletionRow).not.toBeNull();
        expect(deletionRow).toHaveClass('is-pending-deletion');
        expect(
            deletionRow?.querySelector('.ai-workspace-diff-sign'),
        ).toHaveTextContent('-');
        expect(deletionRow).toHaveTextContent(
            'const total = items.reduce((a, b) => a + b, 0);',
        );

        expect(additionRow).not.toBeNull();
        expect(additionRow).toHaveClass('is-pending-addition');
        expect(
            additionRow?.querySelector('.ai-workspace-diff-sign'),
        ).toHaveTextContent('+');
        expect(additionRow).toHaveTextContent(
            'const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);',
        );
        const pendingBtn = screen.getByTestId('workspace-pending-btn-intv-1');
        expect(pendingBtn).toHaveTextContent('介入1');
        expect(
            screen.queryByTestId('workspace-action-popover-intv-1'),
        ).toBeNull();

        // 4. 介入1ボタンを押すと行を押し出さないフローティング簡易アクションバーが開き、採用・却下・詳細が操作できること（要件3）
        fireEvent.click(pendingBtn);
        const popover = screen.getByTestId('workspace-action-popover-intv-1');
        expect(popover).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('workspace-apply-intv-1'));
        expect(onApplyIntervention).toHaveBeenCalledWith(
            'intv-1',
            'const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);',
        );

        // 再度開いて却下・詳細をテスト
        fireEvent.click(pendingBtn);
        fireEvent.click(screen.getByTestId('workspace-reject-intv-1'));
        expect(onRejectIntervention).toHaveBeenCalledWith('intv-1');

        fireEvent.click(pendingBtn);
        fireEvent.click(screen.getByTestId('workspace-detail-intv-1'));
        expect(onSelectIntervention).toHaveBeenCalledWith('intv-1');

        // 5. 最下部の掲示板リストには過去分も含めて「介入1：...」「介入2：...」が並び、2番目の詳細で intv-2 が開かれること
        expect(
            screen.getByText('介入1：不要な再計算のメモ化'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('介入2：null安全チェックの追加'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('proposal-toggle-intv-2'));
        expect(screen.getByTestId('proposal-body-intv-2')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('proposal-detail-intv-2'));
        expect(onSelectIntervention).toHaveBeenLastCalledWith('intv-2');
    });

    it('不要なボタン（今すぐAI解析ボタンなど）が存在しないこと', () => {
        render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={vi.fn()}
                interventions={mockInterventions}
                onSelectIntervention={vi.fn()}
            />,
        );

        expect(screen.queryByText(/今すぐAI解析/i)).not.toBeInTheDocument();
    });

    it('設定パネルに「🔗 エディタとスクロール同期」チェックボックスがあり、ON/OFF切り替えとコード行の data-workspace-line 付与が機能すること', () => {
        const onScrollSyncChange = vi.fn();

        render(
            <SidebarInitialView
                personaId="mentor"
                onPersonaChange={vi.fn()}
                frequency="onSave"
                onFrequencyChange={vi.fn()}
                intervalSeconds={60}
                onIntervalSecondsChange={vi.fn()}
                model="gemini-3.5-flash-lite"
                onModelChange={vi.fn()}
                hasApiKey={true}
                apiKeyLength={39}
                onSaveApiKey={vi.fn()}
                interventions={mockInterventions}
                documentText={sampleDocText}
                documentFileName="src/Demo.tsx"
                onSelectIntervention={vi.fn()}
                isSettingsOpen={true}
                scrollSyncEnabled={true}
                onScrollSyncChange={onScrollSyncChange}
            />,
        );

        const checkbox = screen.getByTestId(
            'scroll-sync-checkbox',
        ) as HTMLInputElement;
        expect(checkbox).toBeInTheDocument();
        expect(checkbox.checked).toBe(true);

        fireEvent.click(checkbox);
        expect(onScrollSyncChange).toHaveBeenCalledWith(false);

        const workspaceCode = screen.getByTestId('ai-workspace-code');
        expect(workspaceCode).toHaveClass('ai-workspace-code');
        const lineNodes = workspaceCode.querySelectorAll('[data-workspace-line]');
        // 元6行のうち pending 行(line 1)が削除行(-)+追加行(+)の2行になるため計7行
        expect(lineNodes.length).toBe(7);
        expect(lineNodes[0]?.getAttribute('data-workspace-line')).toBe('0');
        expect(lineNodes[0]).toHaveClass('ai-workspace-line-group');
        expect(
            lineNodes[0]?.querySelector('.ai-workspace-line-row'),
        ).not.toBeNull();
        expect(lineNodes[6]?.getAttribute('data-workspace-line')).toBe('5');
    });
});

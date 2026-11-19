/**
 * [Why/Intent] SidebarDialogueView コンポーネントの単体テストスイート。
 * ⬅️ 戻るボタン、📝 変更理由（ペルソナ反映）、🔍 読み取り専用Diffプレビュー、
 * 💬 AIチャット（ペルソナ別の初手セリフ自動表示＋履歴表示＋送信）、
 * および「✓ 採用」「✕ 破棄」の2大アクションと、採用後・破棄後からのやり直しモードを網羅検証する。
 * また、廃止された「変更方針の修正（Refine）」「⏪ アンドゥ」「⏩ 適用」「差分内の[採用]/[破棄]」が存在しないことを
 * Negative Assertion（RULE-005）で厳格に検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarDialogueView } from '../../components/SidebarDialogueView';
import type { InterventionDetail } from '../../types/onDemandIntervention';

describe('SidebarDialogueView Test Suite', () => {
    const mockDetail: InterventionDetail = {
        id: 'intv-1',
        title: '不要な再計算のメモ化',
        summary: 'useMemoを使用して重い計算をキャッシュします',
        originalCode: 'const total = calculate(items);',
        proposedCode: 'const total = useMemo(() => calculate(items), [items]);',
        range: { start: { line: 10, character: 0 }, end: { line: 11, character: 0 } },
        status: 'pending',
        personaId: 'mentor',
        createdAt: '2026-11-05T00:00:00Z',
        updatedAt: '2026-11-05T00:00:00Z',
        chatHistory: [
            {
                id: 'msg-1',
                sender: 'user',
                message: '依存配列はどう設定すべき？',
                timestamp: '2026-11-05T00:01:00Z',
            },
            {
                id: 'msg-2',
                sender: 'ai',
                message: 'items を渡せば大丈夫です！',
                timestamp: '2026-11-05T00:01:05Z',
                personaId: 'mentor',
            },
        ],
    };

    it('「⬅️ 一覧・簡易設定に戻る」ボタン押下でonBackが呼ばれること', () => {
        const onBack = vi.fn();
        render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={onBack}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        const backBtn = screen.getByRole('button', { name: /一覧・簡易設定に戻る/i });
        expect(backBtn).toBeInTheDocument();
        fireEvent.click(backBtn);
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('変更理由・読み取り専用差分が表示され、廃止された「変更方針の修正」「アンドゥ」「適用」「採用/破棄」が存在しないこと（RULE-005）', () => {
        render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={vi.fn()}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        // 変更理由と差分の存在確認
        expect(screen.getByText('📝 変更理由')).toBeInTheDocument();
        expect(screen.getByText(/useMemoを使用して重い計算をキャッシュします/)).toBeInTheDocument();
        expect(screen.getByText('🔍 変更差分')).toBeInTheDocument();
        expect(screen.getByText('- const total = calculate(items);')).toBeInTheDocument();
        expect(
            screen.getByText('+ const total = useMemo(() => calculate(items), [items]);'),
        ).toBeInTheDocument();

        // Negative Assertions: 廃止されたUI要素が存在しないこと
        expect(screen.queryByText(/変更方針の修正/i)).toBeNull();
        expect(screen.queryByPlaceholderText(/こういう方向で変えて/i)).toBeNull();
        expect(screen.queryByRole('button', { name: /アンドゥ/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /⏩ 適用/i })).toBeNull();
        expect(screen.queryByTestId('diff-toolbar')).toBeNull();
        expect(screen.queryByTestId('diff-accept-btn')).toBeNull();
        expect(screen.queryByTestId('diff-discard-btn')).toBeNull();
    });

    it('「✓ 採用」と「✕ 破棄」ボタンが動作し、採用後・破棄後でもやり直しトグルが可能であること', () => {
        const onApply = vi.fn();
        const onReject = vi.fn();
        const { rerender } = render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={vi.fn()}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={onApply}
                onReject={onReject}
            />,
        );

        // 1. pending状態: 「✓ 採用」と「✕ 破棄」の両方が表示
        const applyBtn = screen.getByTestId('apply-proposal-btn');
        const discardBtn = screen.getByTestId('discard-proposal-btn');
        expect(applyBtn).toBeInTheDocument();
        expect(discardBtn).toBeInTheDocument();

        fireEvent.click(applyBtn);
        expect(onApply).toHaveBeenCalledWith('intv-1');

        fireEvent.click(discardBtn);
        expect(onReject).toHaveBeenCalledWith('intv-1');

        // 2. applied状態に遷移: 「✓ 採用中」バッジと「✕ 破棄に戻す」ボタンが表示される
        rerender(
            <SidebarDialogueView
                detail={{ ...mockDetail, status: 'applied' }}
                onBack={vi.fn()}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={onApply}
                onReject={onReject}
            />,
        );

        expect(screen.getByTestId('applied-banner')).toBeInTheDocument();
        expect(screen.getByTestId('applied-status-btn')).toBeInTheDocument();
        const rollbackBtn = screen.getByTestId('rollback-to-discard-btn');
        expect(rollbackBtn).toBeInTheDocument();
        fireEvent.click(rollbackBtn);
        expect(onReject).toHaveBeenCalledWith('intv-1');

        // 3. dismissed状態に遷移: 「✕ 破棄済」バッジと「✓ 採用し直す」ボタンが表示される
        rerender(
            <SidebarDialogueView
                detail={{ ...mockDetail, status: 'dismissed' }}
                onBack={vi.fn()}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={onApply}
                onReject={onReject}
            />,
        );

        expect(screen.getByTestId('dismissed-banner')).toBeInTheDocument();
        expect(screen.getByTestId('discarded-status-btn')).toBeInTheDocument();
        const reapplyBtn = screen.getByTestId('reapply-btn');
        expect(reapplyBtn).toBeInTheDocument();
        fireEvent.click(reapplyBtn);
        expect(onApply).toHaveBeenCalledWith('intv-1');
    });

    it('ペルソナに応じた初手のセリフとチャットメッセージが描画され、新規メッセージを送信できること', () => {
        const onSendMessage = vi.fn();
        render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={vi.fn()}
                onSendMessage={onSendMessage}
                isChatLoading={false}
                onApply={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        // 初手のセリフ（mentor）が自動補完されていること
        expect(
            screen.getByText(/こんにちは！やさしい解説メンターです/i),
        ).toBeInTheDocument();

        // 履歴のメッセージが表示されていること
        expect(screen.getByText(/依存配列はどう設定すべき？/)).toBeInTheDocument();
        expect(screen.getByText(/items を渡せば大丈夫です！/)).toBeInTheDocument();
        expect(screen.getAllByText(/メンター/i).length).toBeGreaterThan(0);

        // チャット送信
        const chatInput = screen.getByPlaceholderText(/質問や相談を入力/i);
        fireEvent.change(chatInput, { target: { value: 'パフォーマンスへの影響は？' } });
        fireEvent.click(screen.getByRole('button', { name: '送信' }));
        expect(onSendMessage).toHaveBeenCalledWith('パフォーマンスへの影響は？');
    });
});

/**
 * [Why/Intent] SidebarDialogueView コンポーネントの単体テストスイート。
 * ⬅️ 戻るボタン、サマリー表示、💡 方針修正（Refine）フォーム、Diffプレビュー、
 * AIチャット（ペルソナ履歴表示）、および操作ボタングループの各アクションとローディング/エラー制御を検証する。
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
                onRefine={vi.fn()}
                isRefining={false}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        const backBtn = screen.getByRole('button', { name: /一覧・簡易設定に戻る/i });
        expect(backBtn).toBeInTheDocument();
        fireEvent.click(backBtn);
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('サマリー表示と変更方針修正（Refine）フォームの入力・再生成が機能すること', () => {
        const onRefine = vi.fn();
        render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={vi.fn()}
                onRefine={onRefine}
                isRefining={false}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        expect(screen.getByText(/useMemoを使用して重い計算をキャッシュします/)).toBeInTheDocument();

        const input = screen.getByPlaceholderText(/こういう方向で変えて/i);
        fireEvent.change(input, { target: { value: 'useCallbackにして' } });

        const regenerateBtn = screen.getByRole('button', { name: /コードを再生成/i });
        fireEvent.click(regenerateBtn);

        expect(onRefine).toHaveBeenCalledWith('useCallbackにして');
    });

    it('isRefiningがtrueの時に再生成ボタンがdisabledになること', () => {
        render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={vi.fn()}
                onRefine={vi.fn()}
                isRefining={true}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        const regenerateBtn = screen.getByRole('button', { name: /再生成中|コードを再生成/i });
        expect(regenerateBtn).toBeDisabled();
    });

    it('refineErrorが渡された場合にエラーメッセージが表示されること', () => {
        render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={vi.fn()}
                onRefine={vi.fn()}
                isRefining={false}
                refineError="AIによる再推敲に失敗しました"
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        expect(screen.getByText(/AIによる再推敲に失敗しました/)).toBeInTheDocument();
    });

    it('操作ボタン（適用・アンドゥ・却下）のクリックで対応コールバックが呼ばれること', () => {
        const onApply = vi.fn();
        const onUndo = vi.fn();
        const onReject = vi.fn();

        const { rerender } = render(
            <SidebarDialogueView
                detail={mockDetail} // pending
                onBack={vi.fn()}
                onRefine={vi.fn()}
                isRefining={false}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={onApply}
                onUndo={onUndo}
                onReject={onReject}
            />,
        );

        const applyBtn = screen.getByRole('button', { name: /適用/i });
        fireEvent.click(applyBtn);
        expect(onApply).toHaveBeenCalledWith('intv-1');

        const rejectBtn = screen.getByRole('button', { name: /却下/i });
        fireEvent.click(rejectBtn);
        expect(onReject).toHaveBeenCalledWith('intv-1');

        // applied状態にしてアンドゥを検証
        rerender(
            <SidebarDialogueView
                detail={{ ...mockDetail, status: 'applied' }}
                onBack={vi.fn()}
                onRefine={vi.fn()}
                isRefining={false}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={onApply}
                onUndo={onUndo}
                onReject={onReject}
            />,
        );

        const undoBtn = screen.getByRole('button', { name: /元に戻す|アンドゥ/i });
        fireEvent.click(undoBtn);
        expect(onUndo).toHaveBeenCalledWith('intv-1');
    });

    it('ペルソナ履歴付きチャットメッセージが正しく描画されること', () => {
        render(
            <SidebarDialogueView
                detail={mockDetail}
                onBack={vi.fn()}
                onRefine={vi.fn()}
                isRefining={false}
                onSendMessage={vi.fn()}
                isChatLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        expect(screen.getByText(/依存配列はどう設定すべき？/)).toBeInTheDocument();
        expect(screen.getByText(/items を渡せば大丈夫です！/)).toBeInTheDocument();
        expect(screen.getByText(/メンター/i)).toBeInTheDocument();
    });
});

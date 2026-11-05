/**
 * [Why/Intent] オンデマンドWebviewサイドパネル（左右2カラムレイアウト: Diff + Chat・操作ペイン）の
 * フロントエンド単体テスト。状態遷移マトリクス全4状態、各ボタントリガー、クローズボタン、
 * ペルソナ変更、チャット送信キーバインド（Enter/Shift+Enter）を厳格に検証する。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnDemandSidePanel } from '../../components/OnDemandSidePanel';
import type { InterventionDetail } from '../../types/onDemandIntervention';

describe('OnDemandSidePanel Component', () => {
    const dummyDetail: InterventionDetail = {
        id: 'test-int-001',
        title: 'forEachをreduceに変更',
        summary: '配列走査を宣言的に集約し局所変数のミューテーションを排除',
        range: {
            start: { line: 12, character: 4 },
            end: { line: 14, character: 7 },
        },
        status: 'pending',
        personaId: 'concise',
        originalCode: 'items.forEach(item => {\n    total += item.price * item.quantity;\n});',
        proposedCode:
            'return items.reduce((acc, item) => {\n    return acc + (item.price * item.quantity);\n}, 0);',
        createdAt: '2026-11-05T12:00:00.000Z',
        updatedAt: '2026-11-05T12:00:00.000Z',
        chatHistory: [
            {
                id: 'msg-001',
                sender: 'ai',
                message: '配列走査をreduceに集約しました。副作用のない安全な記述にします。',
                timestamp: '2026-11-05T12:00:00.000Z',
            },
        ],
    };

    it('2カラムレイアウト（DiffビューおよびChat・操作ペイン）が正しく描画されること', () => {
        render(
            <OnDemandSidePanel
                detail={dummyDetail}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByTestId('diff-column')).toBeInTheDocument();
        expect(screen.getByTestId('chat-column')).toBeInTheDocument();
        expect(screen.getByText('forEachをreduceに変更')).toBeInTheDocument();
    });

    it('status === "pending" のとき、アンドゥが無効で適用・却下が有効であること', () => {
        render(
            <OnDemandSidePanel
                detail={{ ...dummyDetail, status: 'pending' }}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        const undoBtn = screen.getByRole('button', { name: /提案を取り消す/i });
        const applyBtn = screen.getByRole('button', { name: /提案を適用/i });
        const discardBtn = screen.getByRole('button', { name: /提案を却下/i });

        expect(undoBtn).toBeDisabled();
        expect(applyBtn).toBeEnabled();
        expect(discardBtn).toBeEnabled();
    });

    it('status === "applied" のとき、アンドゥと却下が有効で適用が無効であること', () => {
        render(
            <OnDemandSidePanel
                detail={{ ...dummyDetail, status: 'applied' }}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        const undoBtn = screen.getByRole('button', { name: /提案を取り消す/i });
        const applyBtn = screen.getByRole('button', { name: /提案を適用/i });
        const discardBtn = screen.getByRole('button', { name: /提案を却下/i });

        expect(undoBtn).toBeEnabled();
        expect(applyBtn).toBeDisabled();
        expect(discardBtn).toBeEnabled();
    });

    it('status === "reverted" のとき、アンドゥが無効で適用・却下が有効であること', () => {
        render(
            <OnDemandSidePanel
                detail={{ ...dummyDetail, status: 'reverted' }}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        const undoBtn = screen.getByRole('button', { name: /提案を取り消す/i });
        const applyBtn = screen.getByRole('button', { name: /提案を適用/i });
        const discardBtn = screen.getByRole('button', { name: /提案を却下/i });

        expect(undoBtn).toBeDisabled();
        expect(applyBtn).toBeEnabled();
        expect(discardBtn).toBeEnabled();
    });

    it('status === "dismissed" のとき、アンドゥ・適用・却下の全ボタンが無効であること', () => {
        render(
            <OnDemandSidePanel
                detail={{ ...dummyDetail, status: 'dismissed' }}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        const undoBtn = screen.getByRole('button', { name: /提案を取り消す/i });
        const applyBtn = screen.getByRole('button', { name: /提案を適用/i });
        const discardBtn = screen.getByRole('button', { name: /提案を却下/i });

        expect(undoBtn).toBeDisabled();
        expect(applyBtn).toBeDisabled();
        expect(discardBtn).toBeDisabled();
    });

    it('「適用」「アンドゥ」「却下」ボタンクリック時にそれぞれのハンドラが呼ばれること', () => {
        const onApply = vi.fn();
        const onUndo = vi.fn();
        const onDiscard = vi.fn();

        const { rerender } = render(
            <OnDemandSidePanel
                detail={{ ...dummyDetail, status: 'pending' }}
                persona="concise"
                isLoading={false}
                onApply={onApply}
                onUndo={onUndo}
                onDiscard={onDiscard}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /提案を適用/i }));
        expect(onApply).toHaveBeenCalledWith('test-int-001');

        fireEvent.click(screen.getByRole('button', { name: /提案を却下/i }));
        expect(onDiscard).toHaveBeenCalledWith('test-int-001');

        // applied状態でアンドゥ検証
        rerender(
            <OnDemandSidePanel
                detail={{ ...dummyDetail, status: 'applied' }}
                persona="concise"
                isLoading={false}
                onApply={onApply}
                onUndo={onUndo}
                onDiscard={onDiscard}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /提案を取り消す/i }));
        expect(onUndo).toHaveBeenCalledWith('test-int-001');
    });

    it('クローズボタン（✖ 閉じる）クリック時に onClose が呼ばれること', () => {
        const onClose = vi.fn();
        render(
            <OnDemandSidePanel
                detail={dummyDetail}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={onClose}
            />,
        );

        const closeBtn = screen.getByRole('button', { name: /閉じる/i });
        fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ペルソナセレクタ変更時に onSwitchPersona が呼ばれること', () => {
        const onSwitchPersona = vi.fn();
        render(
            <OnDemandSidePanel
                detail={dummyDetail}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={onSwitchPersona}
                onClose={vi.fn()}
            />,
        );

        const select = screen.getByRole('combobox', { name: /ペルソナ/i });
        fireEvent.change(select, { target: { value: 'architect' } });
        expect(onSwitchPersona).toHaveBeenCalledWith('architect');
    });

    it('チャット入力で Enter 押下時に送信され、Shift+Enter 押下時には送信されないこと', () => {
        const onSendMessage = vi.fn();
        render(
            <OnDemandSidePanel
                detail={dummyDetail}
                persona="concise"
                isLoading={false}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={onSendMessage}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        const textarea = screen.getByPlaceholderText(/AIと対話・追加指示/i);

        // Shift+Enter の場合（改行）➜ 送信されない
        fireEvent.change(textarea, { target: { value: '行1\n行2' } });
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
        expect(onSendMessage).not.toHaveBeenCalled();

        // Enter の場合 ➜ 送信される
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(onSendMessage).toHaveBeenCalledWith('test-int-001', '行1\n行2');
    });

    it('isLoading === true のとき送信ボタンが無効化されスピナーが表示されること', () => {
        render(
            <OnDemandSidePanel
                detail={dummyDetail}
                persona="concise"
                isLoading={true}
                onApply={vi.fn()}
                onUndo={vi.fn()}
                onDiscard={vi.fn()}
                onSendMessage={vi.fn()}
                onSwitchPersona={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        const sendBtn = screen.getByRole('button', { name: /送信/i });
        expect(sendBtn).toBeDisabled();
        expect(screen.getByTestId('chat-spinner')).toBeInTheDocument();
    });
});

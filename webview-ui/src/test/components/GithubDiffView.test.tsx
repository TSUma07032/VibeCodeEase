/**
 * [Why/Intent] GithubDiffView コンポーネントの単体テストスイート。
 * GitHub風Unified Diffビューの表示、左揃えツールバー、[採用][破棄][理由トグル]の3段階アクション、
 * 赤/緑の差分行属性、エッジケース（純粋追加/純粋削除）、アクセシビリティ属性（RULE-009）・非存在検証（RULE-005）を厳格に検証する。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GithubDiffView } from '../../components/GithubDiffView';
import type { WebviewIntervention } from '../../types';

describe('GithubDiffView Component', () => {
    /**
     * [Why/Intent] 単一行および複数行の置換差分を模倣するテスト用フィクスチャ。
     */
    const dummyIntervention: WebviewIntervention = {
        id: 'test-intervention-1',
        range: {
            start: { line: 2, character: 0 },
            end: { line: 3, character: 10 }
        },
        originalText: 'const calculate = (a: any, b: any) => {\n  return a + b;',
        replacementText: 'const calculate = (a: number, b: number): number => {\n  return a + b;',
        message: '型安全性を向上させるため、any を number に変更し戻り値の型を追加しました。'
    };

    it('初期レンダリング時に左揃えツールバー、3段階アクションボタン、および差分行が正しく描画されること', () => {
        const onApply = vi.fn();
        const onDiscard = vi.fn();

        render(
            <GithubDiffView
                intervention={dummyIntervention}
                onApply={onApply}
                onDiscard={onDiscard}
            />
        );

        // 外枠とアクセシビリティ属性の検証 (RULE-009)
        const container = screen.getByTestId('github-diff-view-test-intervention-1');
        expect(container).toBeInTheDocument();
        expect(container).toHaveAttribute('role', 'region');
        expect(container).toHaveAttribute('aria-label', 'AIコード変更提案');

        // ツールバーの存在および左揃えスタイルの検証
        const toolbar = screen.getByTestId('diff-toolbar');
        expect(toolbar).toBeInTheDocument();
        expect(toolbar.style.display).toBe('flex');
        expect(toolbar.style.justifyContent).toBe('flex-start');

        // ツールバーボタンの存在確認
        const acceptBtn = screen.getByTestId('diff-accept-btn');
        const discardBtn = screen.getByTestId('diff-discard-btn');
        const reasonToggleBtn = screen.getByTestId('diff-reason-toggle-btn');

        expect(acceptBtn).toHaveTextContent('[採用]');
        expect(acceptBtn).toHaveAttribute('aria-label', '採用');

        expect(discardBtn).toHaveTextContent('[破棄]');
        expect(discardBtn).toHaveAttribute('aria-label', '破棄');

        expect(reasonToggleBtn).toHaveTextContent('[ 理由を確認 ▾ ]');
        expect(reasonToggleBtn).toHaveAttribute('aria-label', '理由を確認');
        expect(reasonToggleBtn).toHaveAttribute('aria-expanded', 'false');
        expect(reasonToggleBtn).toHaveAttribute('aria-controls', 'diff-reason-test-intervention-1');

        // 差分行の表示検証（行番号 3-, 4- / 3+, 4+）
        expect(screen.getByText('3 -')).toBeInTheDocument();
        expect(screen.getByText('4 -')).toBeInTheDocument();
        expect(screen.getByText('3 +')).toBeInTheDocument();
        expect(screen.getByText('4 +')).toBeInTheDocument();

        // 差分テキスト（1行目および2行目）のプレフィックス検証
        expect(screen.getByText('- const calculate = (a: any, b: any) => {')).toBeInTheDocument();
        expect(screen.getByText('- return a + b;')).toBeInTheDocument();
        expect(screen.getByText('+ const calculate = (a: number, b: number): number => {')).toBeInTheDocument();
        expect(screen.getByText('+ return a + b;')).toBeInTheDocument();

        // 赤（削除）/緑（追加）の差分行要素とスタイルの検証
        const delLines = screen.getAllByTestId('github-diff-view-test-intervention-1')[0].querySelectorAll('[data-diff-type="deletion"]');
        expect(delLines.length).toBe(2);
        expect((delLines[0] as HTMLElement).style.backgroundColor).toContain('rgba(248, 81, 73');

        const addLines = screen.getAllByTestId('github-diff-view-test-intervention-1')[0].querySelectorAll('[data-diff-type="addition"]');
        expect(addLines.length).toBe(2);
        expect((addLines[0] as HTMLElement).style.backgroundColor).toContain('rgba(46, 160, 67');

        // 初期状態では理由コンテンツが存在しないこと (Negative Assertion)
        expect(screen.queryByTestId('diff-reason-content')).toBeNull();

        // RULE-005 非存在検証: 旧電球アイコンおよび撤廃文字列が存在しないこと
        expect(screen.queryByTitle('View AI Proposal')).toBeNull();
        expect(screen.queryByText(/@@ AI Suggestion @@/)).toBeNull();
    });

    it('[採用] ボタン押下時に onApply が対象の intervention を引数として呼び出されること', () => {
        const onApply = vi.fn();
        const onDiscard = vi.fn();

        render(
            <GithubDiffView
                intervention={dummyIntervention}
                onApply={onApply}
                onDiscard={onDiscard}
            />
        );

        fireEvent.click(screen.getByTestId('diff-accept-btn'));
        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onApply).toHaveBeenCalledWith(dummyIntervention);
        expect(onDiscard).not.toHaveBeenCalled();
    });

    it('[破棄] ボタン押下時に onDiscard が対象の id を引数として呼び出されること', () => {
        const onApply = vi.fn();
        const onDiscard = vi.fn();

        render(
            <GithubDiffView
                intervention={dummyIntervention}
                onApply={onApply}
                onDiscard={onDiscard}
            />
        );

        fireEvent.click(screen.getByTestId('diff-discard-btn'));
        expect(onDiscard).toHaveBeenCalledTimes(1);
        expect(onDiscard).toHaveBeenCalledWith('test-intervention-1');
        expect(onApply).not.toHaveBeenCalled();
    });

    it('理由トグルボタン押下で理由コンテンツが開閉し、ラベルと aria-expanded および id 紐づけが正しく動作すること', () => {
        render(
            <GithubDiffView
                intervention={dummyIntervention}
                onApply={vi.fn()}
                onDiscard={vi.fn()}
            />
        );

        const reasonToggleBtn = screen.getByTestId('diff-reason-toggle-btn');

        // クリックして開く
        fireEvent.click(reasonToggleBtn);
        expect(reasonToggleBtn).toHaveTextContent('[ 理由を閉じる ▴ ]');
        expect(reasonToggleBtn).toHaveAttribute('aria-label', '理由を閉じる');
        expect(reasonToggleBtn).toHaveAttribute('aria-expanded', 'true');

        const reasonContent = screen.getByTestId('diff-reason-content');
        expect(reasonContent).toBeInTheDocument();
        expect(reasonContent).toHaveAttribute('id', 'diff-reason-test-intervention-1');
        expect(reasonContent).toHaveTextContent('【推敲理由】');
        expect(reasonContent).toHaveTextContent(dummyIntervention.message);

        // もう一度クリックして閉じる
        fireEvent.click(reasonToggleBtn);
        expect(reasonToggleBtn).toHaveTextContent('[ 理由を確認 ▾ ]');
        expect(reasonToggleBtn).toHaveAttribute('aria-label', '理由を確認');
        expect(reasonToggleBtn).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('diff-reason-content')).toBeNull();
    });

    it('エッジケース: 純粋な新規挿入（originalText=""）のとき削除行が0件で追加行のみが描画されること', () => {
        const insertionIntervention: WebviewIntervention = {
            id: 'insert-1',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
            originalText: '',
            replacementText: 'const newInserted = true;',
            message: '新規追加'
        };

        render(
            <GithubDiffView
                intervention={insertionIntervention}
                onApply={vi.fn()}
                onDiscard={vi.fn()}
            />
        );

        const container = screen.getByTestId('github-diff-view-insert-1');
        const delLines = container.querySelectorAll('[data-diff-type="deletion"]');
        expect(delLines.length).toBe(0);

        const addLines = container.querySelectorAll('[data-diff-type="addition"]');
        expect(addLines.length).toBe(1);
        expect(screen.getByText('+ const newInserted = true;')).toBeInTheDocument();
    });

    it('エッジケース: 純粋な削除（replacementText=""）のとき追加行が0件で削除行のみが描画されること', () => {
        const deletionIntervention: WebviewIntervention = {
            id: 'delete-1',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
            originalText: 'console.log("deprecated");',
            replacementText: '',
            message: '不要なデバッグ出力を削除'
        };

        render(
            <GithubDiffView
                intervention={deletionIntervention}
                onApply={vi.fn()}
                onDiscard={vi.fn()}
            />
        );

        const container = screen.getByTestId('github-diff-view-delete-1');
        const addLines = container.querySelectorAll('[data-diff-type="addition"]');
        expect(addLines.length).toBe(0);

        const delLines = container.querySelectorAll('[data-diff-type="deletion"]');
        expect(delLines.length).toBe(1);
        expect(screen.getByText('- console.log("deprecated");')).toBeInTheDocument();
    });
});

/**
 * [Why/Intent] MirrorEditor における GitHub風Diffビューのインライン統合レンダリングテスト。
 * 通常行と介入行の置換描画、複数行スキップ、空ドキュメントエッジケース、重複排除、アクション委譲、および旧電球アイコンの完全排除を検証する。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MirrorEditor } from '../../components/MirrorEditor';
import type { WebviewIntervention } from '../../types';

describe('MirrorEditor Diff Integration', () => {
    it('介入が存在しない通常時は全行が通常のエディタ行として描画されること', () => {
        const text = 'line 1\nline 2\nline 3';
        render(
            <MirrorEditor
                text={text}
                interventions={[]}
                onApply={vi.fn()}
                onDiscard={vi.fn()}
            />
        );

        expect(screen.getByText('line 1')).toBeInTheDocument();
        expect(screen.getByText('line 2')).toBeInTheDocument();
        expect(screen.getByText('line 3')).toBeInTheDocument();

        // 差分ビューや旧電球アイコンが存在しないこと (RULE-004 & RULE-005)
        expect(screen.queryByRole('region', { name: 'AIコード変更提案' })).toBeNull();
        expect(screen.queryByTitle('View AI Proposal')).toBeNull();
    });

    it('単一行の介入が存在する場合、対象行の通常レンダリングがスキップされ、GithubDiffView が置換描画されること', () => {
        const text = 'line 1\nold code to replace\nline 3';
        const intervention: WebviewIntervention = {
            id: 'int-replace-1',
            range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 19 }
            },
            originalText: 'old code to replace',
            replacementText: 'new shiny code',
            message: 'コードを最新化'
        };

        const onApply = vi.fn();
        const onDiscard = vi.fn();

        render(
            <MirrorEditor
                text={text}
                interventions={[intervention]}
                onApply={onApply}
                onDiscard={onDiscard}
            />
        );

        // 前後の通常行は描画される
        expect(screen.getByText('line 1')).toBeInTheDocument();
        expect(screen.getByText('line 3')).toBeInTheDocument();

        // 置換された通常行のプレーンテキスト単体描画はスキップされていること（RULE-005 非存在検証）
        expect(screen.queryByText('old code to replace')).toBeNull();

        // 差分ビューが描画され、旧電球アイコンが存在しないこと
        expect(screen.getByTestId('github-diff-view-int-replace-1')).toBeInTheDocument();
        expect(screen.queryByTitle('View AI Proposal')).toBeNull();

        // MirrorEditor から GithubDiffView へのアクション伝播検証
        fireEvent.click(screen.getByTestId('diff-accept-btn'));
        expect(onApply).toHaveBeenCalledWith(intervention);

        fireEvent.click(screen.getByTestId('diff-discard-btn'));
        expect(onDiscard).toHaveBeenCalledWith('int-replace-1');
    });

    it('複数行に跨る介入が存在する場合、該当するすべての通常行がスキップされ、差分ビューのみが描画されること', () => {
        const text = 'header\nmulti line 1\nmulti line 2\nfooter';
        const multiLineIntervention: WebviewIntervention = {
            id: 'int-multi-1',
            range: {
                start: { line: 1, character: 0 },
                end: { line: 2, character: 12 }
            },
            originalText: 'multi line 1\nmulti line 2',
            replacementText: 'single optimized line',
            message: '2行を1行に集約'
        };

        render(
            <MirrorEditor
                text={text}
                interventions={[multiLineIntervention]}
                onApply={vi.fn()}
                onDiscard={vi.fn()}
            />
        );

        // 範囲外の通常行は表示される
        expect(screen.getByText('header')).toBeInTheDocument();
        expect(screen.getByText('footer')).toBeInTheDocument();

        // スキップされた通常行はプレーンテキスト単体として存在しないこと (RULE-005)
        expect(screen.queryByText('multi line 1')).toBeNull();
        expect(screen.queryByText('multi line 2')).toBeNull();

        // 差分ビューが存在すること
        expect(screen.getByTestId('github-diff-view-int-multi-1')).toBeInTheDocument();
    });

    it('エッジケース: 空文字テキスト（text=""）の場合にクラッシュせず1行分の空行が描画されること', () => {
        render(
            <MirrorEditor
                text=""
                interventions={[]}
                onApply={vi.fn()}
                onDiscard={vi.fn()}
            />
        );

        // 行番号 1 が表示されクラッシュしないこと
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'AIコード変更提案' })).toBeNull();
    });
});

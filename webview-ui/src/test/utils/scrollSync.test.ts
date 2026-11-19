/**
 * [Why/Intent] スクロール同期ユーティリティ（findTopVisibleLine / computeScrollTopForLine）の単体テストスイート。
 * インライン提案ボックスによる可変行高・設定パネルによる上部オフセット・最下部掲示板へのスクロールなど
 * 非線形レイアウト下でも行番号アンカーが正確に機能することを検証する。
 */
import { describe, expect, it } from 'vitest';
import {
    computeScrollTopForLine,
    findTopVisibleLine,
} from '../../utils/scrollSync';

function createMockRect(top: number, height: number): DOMRect {
    return {
        top,
        bottom: top + height,
        left: 0,
        right: 300,
        width: 300,
        height,
        x: 0,
        y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

describe('scrollSync utils', () => {
    it('findTopVisibleLine: ビューポート上端にかかっている最初の行（インラインボックス含む）を返すこと', () => {
        const container = document.createElement('div');
        container.getBoundingClientRect = () => createMockRect(100, 400);

        // line 0: 完全に上へ通過（bottom = 90 <= 102）
        const line0 = document.createElement('div');
        line0.dataset.workspaceLine = '0';
        line0.getBoundingClientRect = () => createMockRect(60, 30);

        // line 1: 提案ボックス込みで高さが大きく、現在上端にかかっている（top=90, bottom=250 > 102）
        const line1 = document.createElement('div');
        line1.dataset.workspaceLine = '1';
        line1.getBoundingClientRect = () => createMockRect(90, 160);

        // line 2: 画面内（top=254, bottom=274）
        const line2 = document.createElement('div');
        line2.dataset.workspaceLine = '2';
        line2.getBoundingClientRect = () => createMockRect(254, 20);

        container.append(line0, line1, line2);

        expect(findTopVisibleLine(container)).toBe(1);
    });

    it('findTopVisibleLine: コード終端を越えて最下部掲示板までスクロールした場合は最終コード行を返すこと', () => {
        const container = document.createElement('div');
        container.getBoundingClientRect = () => createMockRect(100, 400);

        const line0 = document.createElement('div');
        line0.dataset.workspaceLine = '0';
        line0.getBoundingClientRect = () => createMockRect(-100, 20);

        const line1 = document.createElement('div');
        line1.dataset.workspaceLine = '1';
        line1.getBoundingClientRect = () => createMockRect(-70, 20);

        container.append(line0, line1);

        expect(findTopVisibleLine(container)).toBe(1);
    });

    it('findTopVisibleLine: コード行が存在しない場合は null を返すこと', () => {
        const container = document.createElement('div');
        expect(findTopVisibleLine(container)).toBeNull();
    });

    it('computeScrollTopForLine: 設定パネル等でオフセットがあっても対象行を上端に揃える scrollTop を正確に算出すること', () => {
        const container = document.createElement('div');
        container.scrollTop = 120;
        container.getBoundingClientRect = () => createMockRect(50, 400);

        const line5 = document.createElement('div');
        line5.dataset.workspaceLine = '5';
        // 現在ビューポート上で top=320 に見える → 120 + (320 - 50) = 390
        line5.getBoundingClientRect = () => createMockRect(320, 20);

        container.append(line5);

        expect(computeScrollTopForLine(container, 5)).toBe(390);
    });

    it('computeScrollTopForLine: 指定行が範囲外の場合は最も近い末尾行へフォールバックすること', () => {
        const container = document.createElement('div');
        container.scrollTop = 0;
        container.getBoundingClientRect = () => createMockRect(0, 400);

        const line0 = document.createElement('div');
        line0.dataset.workspaceLine = '0';
        line0.getBoundingClientRect = () => createMockRect(40, 20);

        const line2 = document.createElement('div');
        line2.dataset.workspaceLine = '2';
        line2.getBoundingClientRect = () => createMockRect(100, 20);

        container.append(line0, line2);

        expect(computeScrollTopForLine(container, 99)).toBe(100);
    });
});

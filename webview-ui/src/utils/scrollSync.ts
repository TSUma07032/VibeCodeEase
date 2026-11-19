/**
 * [Why/Intent] サイドバーのAI作業コード領域（data-workspace-line）と
 * 左側VS Codeテキストエディタの行番号を双方向マッピングするためのスクロール計算ユーティリティ。
 * インライン提案ボックスや設定パネル開閉による非線形な高さ変化に左右されず、
 * 行番号アンカー基準で正確なスクロール位置を算出する。
 */

const TOP_VISIBILITY_TOLERANCE_PX = 2;

/**
 * [Why/Intent] スクロールコンテナ内で現在ビューポート上端に最も近いコード行番号（0始まり）を特定する。
 * インライン提案ボックスを含む行divの rect.bottom を基準にすることで、
 * 提案ボックスを閲覧中は該当コード行に留まり、ボックス通過後に次行へ進む自然な同期を実現する。
 */
export function findTopVisibleLine(container: HTMLElement): number | null {
    const lineElements = container.querySelectorAll<HTMLElement>(
        '[data-workspace-line]',
    );
    if (lineElements.length === 0) {
        return null;
    }

    const containerTop = container.getBoundingClientRect().top;
    let lastValidLine: number | null = null;

    for (const el of lineElements) {
        const lineNum = Number(el.dataset.workspaceLine);
        if (!Number.isFinite(lineNum)) {
            continue;
        }
        lastValidLine = lineNum;
        const rect = el.getBoundingClientRect();
        if (rect.bottom > containerTop + TOP_VISIBILITY_TOLERANCE_PX) {
            return lineNum;
        }
    }

    return lastValidLine;
}

/**
 * [Why/Intent] 指定されたコード行番号（0始まり）をコンテナ上端に揃えるための scrollTop 値（px）を算出する。
 * getBoundingClientRect() の相対差分を使うことで、設定パネルの開閉やネスト構造の影響を受けずに正確な位置を求める。
 */
export function computeScrollTopForLine(
    container: HTMLElement,
    targetLine: number,
): number | null {
    const normalizedTarget = Math.max(0, Math.floor(targetLine));
    const exact = container.querySelector<HTMLElement>(
        `[data-workspace-line="${normalizedTarget}"]`,
    );

    let targetEl = exact;
    if (!targetEl) {
        const lineElements = container.querySelectorAll<HTMLElement>(
            '[data-workspace-line]',
        );
        if (lineElements.length === 0) {
            return null;
        }
        let fallbackEl: HTMLElement | null = null;
        for (const el of lineElements) {
            const lineNum = Number(el.dataset.workspaceLine);
            if (!Number.isFinite(lineNum)) {
                continue;
            }
            if (!fallbackEl || lineNum <= normalizedTarget) {
                fallbackEl = el;
            } else {
                break;
            }
        }
        targetEl = fallbackEl;
    }

    if (!targetEl) {
        return null;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const nextScrollTop = container.scrollTop + (targetRect.top - containerRect.top);
    return Math.max(0, Math.round(nextScrollTop));
}

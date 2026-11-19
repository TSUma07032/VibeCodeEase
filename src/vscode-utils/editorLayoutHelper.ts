/**
 * [Why/Intent] 詳細＆AIチャットパネル展開時に、VS Code のエディタ分割レイアウトを一時的に
 * 縦3ライン構成（左：ユーザー作業エディタ 34% / 右Webview 66%＝中33%・右33%）へ拡大するための純粋計算モジュール。
 */

export interface EditorLayoutGroup {
    size?: number;
    groups?: EditorLayoutGroup[];
}

export interface EditorLayout {
    orientation?: number;
    groups?: EditorLayoutGroup[];
}

const EXPANDED_SIDEBAR_RATIO = 0.66;

/**
 * [Why/Intent] エディタレイアウトオブジェクトを安全にディープクローンする。
 */
export function cloneEditorLayout(layout: EditorLayout): EditorLayout {
    return JSON.parse(JSON.stringify(layout)) as EditorLayout;
}

/**
 * [Why/Intent] 横並びレイアウト（orientation === 0 または未指定）で2グループ以上存在する場合、
 * サイドバー側グループを全体の約66%（Webview内2分割で 34:33:33 の縦3ライン）へ拡大した新レイアウトを算出する。
 * 既に十分広い場合や非対応レイアウトの場合は null を返し、不要な変更を避ける。
 */
export function computeExpandedEditorLayout(
    layout: EditorLayout | undefined,
    targetGroupIndex?: number,
): EditorLayout | null {
    if (!layout || !Array.isArray(layout.groups) || layout.groups.length < 2) {
        return null;
    }
    if (layout.orientation !== undefined && layout.orientation !== 0) {
        return null;
    }

    const cloned = cloneEditorLayout(layout);
    const groups = cloned.groups;
    if (!groups) {
        return null;
    }

    const sidebarIdx =
        targetGroupIndex !== undefined &&
        targetGroupIndex >= 0 &&
        targetGroupIndex < groups.length
            ? targetGroupIndex
            : groups.length - 1;

    const rawSizes = groups.map((g) => (typeof g.size === 'number' && g.size > 0 ? g.size : 1));
    const totalSize = rawSizes.reduce((acc, s) => acc + s, 0);
    if (totalSize <= 0) {
        return null;
    }

    const currentSidebarRatio = rawSizes[sidebarIdx] / totalSize;
    if (currentSidebarRatio >= EXPANDED_SIDEBAR_RATIO) {
        return null;
    }

    const targetSidebarSize = totalSize * EXPANDED_SIDEBAR_RATIO;
    const remainingTargetTotal = totalSize - targetSidebarSize;
    const otherCurrentTotal = totalSize - rawSizes[sidebarIdx];

    for (let i = 0; i < groups.length; i++) {
        if (i === sidebarIdx) {
            groups[i].size = Number(targetSidebarSize.toFixed(4));
        } else {
            const ratio =
                otherCurrentTotal > 0 ? rawSizes[i] / otherCurrentTotal : 1 / (groups.length - 1);
            groups[i].size = Number((remainingTargetTotal * ratio).toFixed(4));
        }
    }

    return cloned;
}

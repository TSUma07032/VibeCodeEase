/**
 * [Why/Intent] AI作業コード領域の表示行モデルを構築する純粋ユーティリティ。
 * - 古い介入（applied / dismissed / reverted）はコード行の右側には一切表示しない（要件1）。
 * - 新しい介入（pending）は該当行範囲の元コードと提案後コードを行単位Diffで比較し、
 *   消した行を赤色（diffKind: 'deletion', diffSign: '-'）、
 *   生やした行を緑色（diffKind: 'addition', diffSign: '+'）としてハイライト表示し、
 *   最初の変更行右端にトリガーボタン（介入N）を付与する。
 */
import type { InterventionItem } from '../types/onDemandIntervention';

export interface IndexedIntervention {
    item: InterventionItem;
    indexNumber: number;
}

export type WorkspaceDiffKind = 'unchanged' | 'deletion' | 'addition';

export interface WorkspaceDisplayRow {
    /** React描画用の一意キー */
    key: string;
    /** 左エディタとのスクロール同期に使う 0 始まり行番号 */
    sourceLine: number;
    /** 左端の行番号表示（通常・削除行は1始まり番号、追加増分行は空または対応行番号） */
    lineNumberLabel: string;
    /** Diff 記号ガター（削除行: '-', 追加行: '+', 通常行: ''） */
    diffSign: '' | '-' | '+';
    /** 行の差分種別（赤=deletion / 緑=addition / 通常=unchanged） */
    diffKind: WorkspaceDiffKind;
    /** 表示するコードテキスト */
    text: string;
    /** 新しい介入（pending）によってハイライトされている変更行か */
    isPendingHighlight: boolean;
    /** この行の右端に並べる新提案トリガーボタン群（最初の変更行のみ） */
    pendingButtons: IndexedIntervention[];
}

interface DiffOp {
    kind: WorkspaceDiffKind;
    text: string;
    oldOffset?: number;
    newOffset?: number;
}

/**
 * [Why/Intent] 元のコード行配列と介入一覧からベース行配列を構築する。
 * documentText が未同期でも介入の originalCode から最低限の行を補完する。
 */
function buildBaseLines(
    documentText: string | undefined,
    interventions: IndexedIntervention[],
): string[] {
    const baseLines =
        documentText && documentText.length > 0
            ? documentText.split(/\r?\n/)
            : [];
    const maxInterventionLine = interventions.reduce(
        (max, { item }) =>
            Math.max(max, item.range.end.line, item.range.start.line),
        -1,
    );

    if (baseLines.length === 0 && maxInterventionLine < 0) {
        return [];
    }

    const totalLines = Math.max(baseLines.length, maxInterventionLine + 1);
    const result: string[] = Array.from(
        { length: totalLines },
        (_, idx) => baseLines[idx] ?? '',
    );

    if (baseLines.length === 0) {
        for (const { item } of interventions) {
            if (item.originalCode) {
                const origLines = item.originalCode.split(/\r?\n/);
                origLines.forEach((lineText, offset) => {
                    const targetLine = item.range.start.line + offset;
                    if (targetLine < result.length && !result[targetLine]) {
                        result[targetLine] = lineText;
                    }
                });
            }
        }
    }

    return result;
}

/**
 * [Why/Intent] 対象行範囲に対して pending 提案の proposedCode を反映した置換後行配列を算出する。
 */
function computeProposedLinesForRange(
    originalSliceLines: string[],
    item: InterventionItem,
): string[] {
    const proposed = item.proposedCode ?? '';
    const original = item.originalCode ?? '';
    const sliceText = originalSliceLines.join('\n');

    let replacedText: string;
    if (original.length > 0 && sliceText.includes(original)) {
        replacedText = sliceText.replace(original, proposed);
    } else {
        replacedText = proposed;
    }

    if (replacedText.length === 0 && proposed.length === 0) {
        return [];
    }

    return replacedText.split(/\r?\n/);
}

/**
 * [Why/Intent] 元の行配列と提案後の行配列から LCS ベースの行単位 Diff（deletion / addition / unchanged）を生成する。
 * 同一ハンク内では削除行（赤 -）を先に、追加行（緑 +）を後に並べて GitHub Diff と同じ直感的な読み順にする。
 */
function computeLineDiffOps(oldLines: string[], newLines: string[]): DiffOp[] {
    const m = oldLines.length;
    const n = newLines.length;

    // 極端に巨大な範囲では計算量を抑えるため素直に全削除＋全追加へフォールバック
    if (m * n > 40000) {
        return [
            ...oldLines.map((text, oldOffset) => ({
                kind: 'deletion' as const,
                text,
                oldOffset,
            })),
            ...newLines.map((text, newOffset) => ({
                kind: 'addition' as const,
                text,
                newOffset,
            })),
        ];
    }

    const dp: number[][] = Array.from({ length: m + 1 }, () =>
        Array<number>(n + 1).fill(0),
    );
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (oldLines[i] === newLines[j]) {
                dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    const ops: DiffOp[] = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (oldLines[i] === newLines[j]) {
            ops.push({
                kind: 'unchanged',
                text: oldLines[i],
                oldOffset: i,
                newOffset: j,
            });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push({ kind: 'deletion', text: oldLines[i], oldOffset: i });
            i += 1;
        } else {
            ops.push({ kind: 'addition', text: newLines[j], newOffset: j });
            j += 1;
        }
    }
    while (i < m) {
        ops.push({ kind: 'deletion', text: oldLines[i], oldOffset: i });
        i += 1;
    }
    while (j < n) {
        ops.push({ kind: 'addition', text: newLines[j], newOffset: j });
        j += 1;
    }

    // 連続する変更ブロック（deletion と addition が混在する区間）で deletion を先、addition を後に整列する
    const normalized: DiffOp[] = [];
    let deletions: DiffOp[] = [];
    let additions: DiffOp[] = [];
    const flushChanges = () => {
        normalized.push(...deletions, ...additions);
        deletions = [];
        additions = [];
    };

    for (const op of ops) {
        if (op.kind === 'deletion') {
            deletions.push(op);
        } else if (op.kind === 'addition') {
            additions.push(op);
        } else {
            flushChanges();
            normalized.push(op);
        }
    }
    flushChanges();

    return normalized;
}

/**
 * [Why/Intent] AI作業コードの表示行配列を構築する。
 * pending 提案のみを行単位 Diff（赤 `-` 削除行 / 緑 `+` 追加行）でハイライト表示し、古い介入は一切付与しない。
 */
export function buildWorkspaceDisplayRows(
    documentText: string | undefined,
    indexedInterventions: IndexedIntervention[],
): WorkspaceDisplayRow[] {
    const baseLines = buildBaseLines(documentText, indexedInterventions);
    if (baseLines.length === 0) {
        return [];
    }

    const pendingEntries = indexedInterventions
        .filter(({ item }) => item.status === 'pending')
        .sort((a, b) => a.item.range.start.line - b.item.range.start.line);

    const pendingByStartLine = new Map<number, IndexedIntervention[]>();
    for (const entry of pendingEntries) {
        const start = Math.max(
            0,
            Math.min(entry.item.range.start.line, baseLines.length - 1),
        );
        const list = pendingByStartLine.get(start) ?? [];
        list.push(entry);
        pendingByStartLine.set(start, list);
    }

    const rows: WorkspaceDisplayRow[] = [];
    let lineIdx = 0;

    while (lineIdx < baseLines.length) {
        const startingPending = pendingByStartLine.get(lineIdx);
        if (!startingPending || startingPending.length === 0) {
            rows.push({
                key: `ws-line-${lineIdx}`,
                sourceLine: lineIdx,
                lineNumberLabel: String(lineIdx + 1),
                diffSign: '',
                diffKind: 'unchanged',
                text: baseLines[lineIdx] ?? '',
                isPendingHighlight: false,
                pendingButtons: [],
            });
            lineIdx += 1;
            continue;
        }

        const primary = startingPending[0];
        const endLine = Math.max(
            lineIdx,
            Math.min(primary.item.range.end.line, baseLines.length - 1),
        );

        const coveredButtons: IndexedIntervention[] = [...startingPending];
        for (let scan = lineIdx + 1; scan <= endLine; scan++) {
            const nested = pendingByStartLine.get(scan);
            if (nested) {
                coveredButtons.push(...nested);
            }
        }

        const originalSliceLines = baseLines.slice(lineIdx, endLine + 1);
        const proposedLines = computeProposedLinesForRange(
            originalSliceLines,
            primary.item,
        );
        const diffOps = computeLineDiffOps(originalSliceLines, proposedLines);

        // 最初の変更行（deletion または addition）に介入ボタンを付ける（万一変更が0件なら先頭行にフォールバック）
        const firstChangeIdx = diffOps.findIndex(
            (op) => op.kind !== 'unchanged',
        );
        const buttonTargetIdx = firstChangeIdx >= 0 ? firstChangeIdx : 0;

        diffOps.forEach((op, opIdx) => {
            const isChanged = op.kind !== 'unchanged';
            const mappedSourceLine =
                op.oldOffset !== undefined
                    ? lineIdx + op.oldOffset
                    : Math.min(lineIdx + (op.newOffset ?? 0), endLine);
            const lineNumberLabel =
                op.kind === 'addition'
                    ? op.newOffset !== undefined &&
                      op.newOffset < originalSliceLines.length
                        ? String(lineIdx + op.newOffset + 1)
                        : ''
                    : String(mappedSourceLine + 1);
            const diffSign: '' | '-' | '+' =
                op.kind === 'deletion'
                    ? '-'
                    : op.kind === 'addition'
                      ? '+'
                      : '';

            rows.push({
                key: `ws-pending-${primary.item.id}-${lineIdx}-${opIdx}-${op.kind}`,
                sourceLine: mappedSourceLine,
                lineNumberLabel,
                diffSign,
                diffKind: op.kind,
                text: op.text,
                isPendingHighlight: isChanged,
                pendingButtons: opIdx === buttonTargetIdx ? coveredButtons : [],
            });
        });

        lineIdx = endLine + 1;
    }

    return rows;
}

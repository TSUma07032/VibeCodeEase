import * as vscode from 'vscode';
import { type LlmEdit, type LlmInterventionPlan, LlmInterventionPlanSchema } from '../../types';

/**
 * 渡された文字列の改行コード（CRLF / LF）を考慮して正規化後オフセットから元の文字列オフセットへ変換する
 */
export function toOriginalOffset(text: string, normalizedOffset: number): number {
    let normalizedIndex = 0;
    for (let originalIndex = 0; originalIndex < text.length; originalIndex++) {
        if (normalizedIndex === normalizedOffset) {
            return originalIndex;
        }
        if (text[originalIndex] === '\r' && text[originalIndex + 1] === '\n') {
            originalIndex++;
        }
        normalizedIndex++;
    }
    return text.length;
}

/**
 * ドキュメント内から変更前テキストの正確な Range を近傍検索するためのパラメータ
 */
export interface FindOriginalTextRangeParams {
    document: vscode.TextDocument;
    oldText: string;
    hintLine: number;
    hintCharacter: number;
}

/**
 * [Why/Intent] LLMが推定した行・文字位置とドキュメント実テキストを突き合わせ、
 * ズレ（行ずれやCRLF差分）を近傍探索で補正した確定Rangeを持つLlmEditを生成する。
 */
function resolveSingleEdit(raw: LlmEdit, document: vscode.TextDocument): LlmEdit {
    if (raw.startLine >= document.lineCount || raw.endLine >= document.lineCount) {
        throw new Error(
            `LLMの変更範囲がファイル外を指しています。要求範囲: ${raw.startLine}:${raw.startCharacter}-${raw.endLine}:${raw.endCharacter}、ファイル: ${document.lineCount}行です。`,
        );
    }

    const resolvedRange = findOriginalTextRange({
        document,
        oldText: raw.oldText,
        hintLine: raw.startLine,
        hintCharacter: raw.startCharacter,
    });
    if (!resolvedRange) {
        throw new Error(
            `LLMが指定したoldTextをファイル内で見つけられません。要求範囲: ${raw.startLine}:${raw.startCharacter}-${raw.endLine}:${raw.endCharacter}`,
        );
    }

    return {
        startLine: resolvedRange.start.line,
        startCharacter: resolvedRange.start.character,
        endLine: resolvedRange.end.line,
        endCharacter: resolvedRange.end.character,
        oldText: raw.oldText,
        newText: raw.newText,
        category: raw.category,
        reason: raw.reason,
    };
}

/**
 * [Why/Intent] LLMから受け取った生のオブジェクトを検証し、TextDocument上の正確な位置にマップされた LlmInterventionPlan を構築する。
 * 不正な形式やドキュメント不一致があれば例外をスローして不正な編集の適用を防ぐ。
 */
export function validatePlan(value: unknown, document: vscode.TextDocument): LlmInterventionPlan {
    if (!value || typeof value !== 'object') {
        throw new Error('LLMの介入プラン形式が不正です。');
    }

    const result = LlmInterventionPlanSchema.safeParse(value);
    if (!result.success) {
        const hasMissingKeys = result.error.errors.some((e) => e.message === 'Required');
        if (
            hasMissingKeys &&
            !(value !== null && typeof value === 'object' && 'summary' in value && 'edits' in value)
        ) {
            throw new Error('LLMの介入プランに必要な項目がありません。');
        }
        if (
            result.error.errors.some(
                (e) =>
                    e.path.includes('oldText') &&
                    e.message === 'String must contain at least 1 character(s)',
            )
        ) {
            throw new Error('LLMの変更案にoldTextがありません。');
        }
        throw new Error('LLMの変更案に不正な値があります。');
    }

    const candidate = result.data;

    const edits: LlmEdit[] = [];
    for (const edit of candidate.edits) {
        const resolved = resolveSingleEdit(edit, document);
        edits.push(resolved);
    }

    return { summary: candidate.summary, edits };
}

/**
 * [Why/Intent] 同一テキストがファイル内に複数存在する場合、
 * LLMが指定した推定オフセット（hintOffset）に最も近い一致箇所のオフセットを特定する。
 */
function findClosestMatchOffset(haystack: string, needle: string, hintOffset: number): number {
    let matchOffsetNormalized = -1;
    let minDistance = Infinity;
    let searchFrom = 0;

    while (true) {
        const match = haystack.indexOf(needle, searchFrom);
        if (match < 0) {
            break;
        }
        const distance = Math.abs(match - hintOffset);
        if (distance < minDistance) {
            minDistance = distance;
            matchOffsetNormalized = match;
        } else if (match > hintOffset) {
            break;
        }
        searchFrom = match + needle.length;
    }

    return matchOffsetNormalized;
}

function getClampedHintOffset(
    document: vscode.TextDocument,
    hintLine: number,
    hintCharacter: number,
): number {
    const clampedHintLine = Math.min(Math.max(0, hintLine), document.lineCount - 1);
    const clampedHintCharacter = Math.min(
        Math.max(0, hintCharacter),
        document.lineAt(clampedHintLine).text.length,
    );
    return document.offsetAt(new vscode.Position(clampedHintLine, clampedHintCharacter));
}

/**
 * 現在のドキュメントから元のテキストを検索し、正しいRangeを返す
 */
export function findOriginalTextRange(
    params: FindOriginalTextRangeParams,
): vscode.Range | undefined {
    if (!params.oldText) {
        return undefined;
    }

    const documentText = params.document.getText();
    const normalizedDocumentText = documentText.replace(/\r\n/g, '\n');
    const normalizedOldText = params.oldText.replace(/\r\n/g, '\n');

    const hintOffset = getClampedHintOffset(params.document, params.hintLine, params.hintCharacter);
    const matchOffsetNormalized = findClosestMatchOffset(
        normalizedDocumentText,
        normalizedOldText,
        hintOffset,
    );

    if (matchOffsetNormalized === -1) {
        return undefined;
    }

    const matchOffset = toOriginalOffset(documentText, matchOffsetNormalized);
    const endOffset = toOriginalOffset(
        documentText,
        matchOffsetNormalized + normalizedOldText.length,
    );
    return new vscode.Range(
        params.document.positionAt(matchOffset),
        params.document.positionAt(endOffset),
    );
}

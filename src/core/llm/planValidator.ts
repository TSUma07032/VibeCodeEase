import * as vscode from 'vscode';
import { type LlmEdit, type LlmInterventionPlan, PAIN_CATEGORIES } from '../../types';

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
 * LLMから受け取った生のオブジェクトを検証し、TextDocument上の正確な位置にマップされた LlmInterventionPlan を構築する
 */
export function validatePlan(value: unknown, document: vscode.TextDocument): LlmInterventionPlan {
    if (!value || typeof value !== 'object') {
        throw new Error('LLMの介入プラン形式が不正です。');
    }

    const candidate = value as { summary?: unknown; edits?: unknown };
    if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.edits)) {
        throw new Error('LLMの介入プランに必要な項目がありません。');
    }

    const edits: LlmEdit[] = [];
    candidate.edits.forEach((edit) => {
        if (!edit || typeof edit !== 'object') {
            return;
        }
        const item = edit as Record<string, unknown>;
        const positions = ['startLine', 'startCharacter', 'endLine', 'endCharacter'];
        if (
            !positions.every((key) => Number.isInteger(item[key]) && (item[key] as number) >= 0) ||
            typeof item.newText !== 'string' ||
            typeof item.category !== 'string' ||
            !PAIN_CATEGORIES.includes(item.category as LlmEdit['category']) ||
            typeof item.reason !== 'string'
        ) {
            return;
        }

        const startLine = item.startLine as number;
        const endLine = item.endLine as number;
        const startCharacter = item.startCharacter as number;
        const endCharacter = item.endCharacter as number;
        if (typeof item.oldText !== 'string' || !item.oldText) {
            return;
        }
        if (startLine >= document.lineCount || endLine >= document.lineCount) {
            console.warn(
                `[vibeCodeEase] LLMの変更範囲がファイル外を指しています。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`,
            );
            return;
        }

        const resolvedRange = findOriginalTextRange(
            document,
            item.oldText,
            startLine,
            startCharacter,
        );
        if (!resolvedRange) {
            console.warn(
                `[vibeCodeEase] LLMが指定したoldTextをファイル内で見つけられません。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`,
            );
            return;
        }

        edits.push({
            startLine: resolvedRange.start.line,
            startCharacter: resolvedRange.start.character,
            endLine: resolvedRange.end.line,
            endCharacter: resolvedRange.end.character,
            oldText: item.oldText,
            newText: item.newText,
            category: item.category as LlmEdit['category'],
            reason: item.reason,
        });
    });

    return { summary: candidate.summary, edits };
}

/**
 * 現在のドキュメントから元のテキストを検索し、正しいRangeを返す
 */
export function findOriginalTextRange(
    document: vscode.TextDocument,
    oldText: string,
    hintLine: number,
    hintCharacter: number,
): vscode.Range | undefined {
    if (!oldText) {
        return undefined;
    }

    const documentText = document.getText();
    const normalizedDocumentText = documentText.replace(/\r\n/g, '\n');
    const normalizedOldText = oldText.replace(/\r\n/g, '\n');

    const clampedHintLine = Math.min(Math.max(0, hintLine), document.lineCount - 1);
    const clampedHintCharacter = Math.min(
        Math.max(0, hintCharacter),
        document.lineAt(clampedHintLine).text.length,
    );
    const hintOffset = document.offsetAt(
        new vscode.Position(clampedHintLine, clampedHintCharacter),
    );

    let matchOffsetNormalized = -1;
    let minDistance = Infinity;
    let searchFrom = 0;
    while (true) {
        const match = normalizedDocumentText.indexOf(normalizedOldText, searchFrom);
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
        searchFrom = match + oldText.length;
    }

    if (matchOffsetNormalized === -1) {
        return undefined;
    }

    const matchOffset = toOriginalOffset(documentText, matchOffsetNormalized);
    const endOffset = toOriginalOffset(
        documentText,
        matchOffsetNormalized + normalizedOldText.length,
    );
    return new vscode.Range(document.positionAt(matchOffset), document.positionAt(endOffset));
}

import * as vscode from 'vscode';
import { LlmEdit, LlmInterventionPlan, PAIN_CATEGORIES } from '../../types';

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

    const edits = candidate.edits.map((edit): LlmEdit => {
        if (!edit || typeof edit !== 'object') {
            throw new Error('LLMの変更案形式が不正です。');
        }
        const item = edit as Record<string, unknown>;
        const positions = ['startLine', 'startCharacter', 'endLine', 'endCharacter'];
        if (!positions.every((key) => Number.isInteger(item[key]) && (item[key] as number) >= 0) ||
            typeof item.newText !== 'string' || typeof item.category !== 'string' ||
            !PAIN_CATEGORIES.includes(item.category as LlmEdit['category']) || typeof item.reason !== 'string') {
            throw new Error('LLMの変更案に不正な値があります。');
        }

        const startLine = item.startLine as number;
        const endLine = item.endLine as number;
        const startCharacter = item.startCharacter as number;
        const endCharacter = item.endCharacter as number;
        if (typeof item.oldText !== 'string' || !item.oldText) {
            throw new Error('LLMの変更案にoldTextがありません。');
        }
        if (startLine >= document.lineCount || endLine >= document.lineCount) {
            throw new Error(`LLMの変更範囲がファイル外を指しています。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}、ファイル: ${document.lineCount}行です。`);
        }

        const documentText = document.getText();
        const normalizedDocumentText = documentText.replace(/\r\n/g, '\n');
        const normalizedOldText = (item.oldText as string).replace(/\r\n/g, '\n');
        const matches: number[] = [];
        let searchFrom = 0;
        while (true) {
            const match = normalizedDocumentText.indexOf(normalizedOldText, searchFrom);
            if (match < 0) {
                break;
            }
            matches.push(match);
            searchFrom = match + item.oldText.length;
        }
        if (matches.length === 0) {
            throw new Error(`LLMが指定したoldTextをファイル内で見つけられません。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`);
        }

        const hintLine = Math.min(startLine, document.lineCount - 1);
        const hintCharacter = Math.min(startCharacter, document.lineAt(hintLine).text.length);
        const hintOffset = document.offsetAt(new vscode.Position(hintLine, hintCharacter));
        const matchOffsetNormalized = matches.reduce((closest, current) =>
            Math.abs(current - hintOffset) < Math.abs(closest - hintOffset) ? current : closest
        );
        const matchOffset = toOriginalOffset(documentText, matchOffsetNormalized);
        const endOffset = toOriginalOffset(documentText, matchOffsetNormalized + normalizedOldText.length);
        const resolvedRange = new vscode.Range(
            document.positionAt(matchOffset),
            document.positionAt(endOffset)
        );

        return {
            startLine: resolvedRange.start.line,
            startCharacter: resolvedRange.start.character,
            endLine: resolvedRange.end.line,
            endCharacter: resolvedRange.end.character,
            oldText: item.oldText as string,
            newText: item.newText as string,
            category: item.category as LlmEdit['category'],
            reason: item.reason as string
        };
    });

    return { summary: candidate.summary, edits };
}

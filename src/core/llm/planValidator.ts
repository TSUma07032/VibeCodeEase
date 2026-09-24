import * as vscode from 'vscode';
import { LlmEdit, LlmInterventionPlan, LlmInterventionPlanSchema } from '../../types';

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
    let candidate: LlmInterventionPlan;
    try {
        candidate = LlmInterventionPlanSchema.parse(value);
    } catch (e: any) {
        if (!value || typeof value !== 'object') {
            throw new Error('LLMの介入プラン形式が不正です。');
        }
        const valObj = value as Record<string, unknown>;
        if (typeof valObj.summary !== 'string' || !Array.isArray(valObj.edits)) {
            throw new Error('LLMの介入プランに必要な項目がありません。');
        }
        if (valObj.edits.some(edit => !edit || typeof edit !== 'object')) {
            throw new Error('LLMの変更案形式が不正です。');
        }
        throw new Error('LLMの変更案に不正な値があります。');
    }

    const edits = candidate.edits.map((item): LlmEdit => {
        const startLine = item.startLine;
        const endLine = item.endLine;
        const startCharacter = item.startCharacter;
        const endCharacter = item.endCharacter;

        if (startLine >= document.lineCount || endLine >= document.lineCount) {
            throw new Error(`LLMの変更範囲がファイル外を指しています。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}、ファイル: ${document.lineCount}行です。`);
        }

        const resolvedRange = findOriginalTextRange(document, item.oldText, startLine, startCharacter);
        if (!resolvedRange) {
            throw new Error(`LLMが指定したoldTextをファイル内で見つけられません。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`);
        }

        return {
            ...item,
            startLine: resolvedRange.start.line,
            startCharacter: resolvedRange.start.character,
            endLine: resolvedRange.end.line,
            endCharacter: resolvedRange.end.character,
        };
    });

    return { summary: candidate.summary, edits };
}

/**
 * 現在のドキュメントから元のテキストを検索し、正しいRangeを返す
 */
export function findOriginalTextRange(document: vscode.TextDocument, oldText: string, hintLine: number, hintCharacter: number): vscode.Range | undefined {
    if (!oldText) {return undefined;}
    
    const documentText = document.getText();
    const normalizedDocumentText = documentText.replace(/\r\n/g, '\n');
    const normalizedOldText = oldText.replace(/\r\n/g, '\n');
    
    const clampedHintLine = Math.min(Math.max(0, hintLine), document.lineCount - 1);
    const clampedHintCharacter = Math.min(Math.max(0, hintCharacter), document.lineAt(clampedHintLine).text.length);
    const hintOffset = document.offsetAt(new vscode.Position(clampedHintLine, clampedHintCharacter));

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
    const endOffset = toOriginalOffset(documentText, matchOffsetNormalized + normalizedOldText.length);
    return new vscode.Range(
        document.positionAt(matchOffset),
        document.positionAt(endOffset)
    );
}

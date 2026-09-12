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
    const parsed = LlmInterventionPlanSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error('LLMの介入プラン形式が不正です。');
    }

    const edits = parsed.data.edits.map((item): LlmEdit => {
        const startLine = item.startLine;
        const endLine = item.endLine;
        const startCharacter = item.startCharacter;
        const endCharacter = item.endCharacter;

        if (startLine >= document.lineCount || endLine >= document.lineCount) {
            throw new Error(`LLMの変更範囲がファイル外を指しています。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}、ファイル: ${document.lineCount}行です。`);
        }

        const documentText = document.getText();
        const normalizedDocumentText = documentText.replace(/\r\n/g, '\n');
        const normalizedOldText = item.oldText.replace(/\r\n/g, '\n');
        const hintLine = Math.min(startLine, document.lineCount - 1);
        const hintCharacter = Math.min(startCharacter, document.lineAt(hintLine).text.length);
        const hintOffset = document.offsetAt(new vscode.Position(hintLine, hintCharacter));

        // ⚡ Bolt: Removed array allocation and added early break, reducing O(N) multi-pass search to O(1) best-case single pass.
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
            searchFrom = match + item.oldText.length;
        }

        if (matchOffsetNormalized === -1) {
            throw new Error(`LLMが指定したoldTextをファイル内で見つけられません。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`);
        }
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

    return { summary: parsed.data.summary, edits };
}

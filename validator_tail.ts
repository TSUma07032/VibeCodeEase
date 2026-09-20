        if (typeof item.oldText !== 'string' || !item.oldText) {
            throw new Error('LLMの変更案にoldTextがありません。');
        }
        if (startLine >= document.lineCount || endLine >= document.lineCount) {
            throw new Error(`LLMの変更範囲がファイル外を指しています。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}、ファイル: ${document.lineCount}行です。`);
        }

        const resolvedRange = findOriginalTextRange(document, item.oldText as string, startLine, startCharacter);
        if (!resolvedRange) {
            throw new Error(`LLMが指定したoldTextをファイル内で見つけられません。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`);
        }

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

/**
 * 現在のドキュメントから元のテキストを検索し、正しいRangeを返す
 */
export function findOriginalTextRange(document: vscode.TextDocument, oldText: string, hintLine: number, hintCharacter: number): vscode.Range | undefined {
    if (!oldText) return undefined;

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

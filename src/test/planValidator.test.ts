import * as assert from 'assert';
import * as vscode from 'vscode';
import { validatePlan, toOriginalOffset } from '../core/llm/planValidator';

suite('PlanValidator Test Suite', () => {
    suite('toOriginalOffset', () => {
        test('LF改行のみの場合はオフセットが一致すること', () => {
            const text = 'line 1\nline 2\nline 3';
            assert.strictEqual(toOriginalOffset(text, 0), 0);
            assert.strictEqual(toOriginalOffset(text, 7), 7);
        });

        test('CRLF改行を含む場合、正規化後のオフセットからCRLF元の位置へ正しく変換されること', () => {
            const text = 'line 1\r\nline 2\r\nline 3';
            // normalized: "line 1\nline 2\nline 3"
            // normalized offset 7 ('l' of line 2) -> original offset should be 8 (after \r\n)
            assert.strictEqual(toOriginalOffset(text, 7), 8);
        });
    });

    suite('validatePlan', () => {
        // テスト用のシンプルなTextDocumentモック
        function createMockDocument(content: string): vscode.TextDocument {
            const lines = content.split(/\r?\n/);
            return {
                fileName: 'test.ts',
                languageId: 'typescript',
                version: 1,
                lineCount: lines.length,
                getText: () => content,
                lineAt: (line: number) => ({
                    text: lines[line],
                    lineNumber: line,
                    range: new vscode.Range(line, 0, line, lines[line].length),
                    rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
                    firstNonWhitespaceCharacterIndex: 0,
                    isEmptyOrWhitespace: lines[line].trim().length === 0
                } as vscode.TextLine),
                positionAt: (offset: number) => {
                    let currentOffset = 0;
                    for (let i = 0; i < lines.length; i++) {
                        const lineLengthWithBreak = lines[i].length + (content.includes('\r\n') ? 2 : 1);
                        if (currentOffset + lineLengthWithBreak > offset || i === lines.length - 1) {
                            const char = Math.min(offset - currentOffset, lines[i].length);
                            return new vscode.Position(i, char);
                        }
                        currentOffset += lineLengthWithBreak;
                    }
                    return new vscode.Position(lines.length - 1, 0);
                },
                offsetAt: (position: vscode.Position) => {
                    let offset = 0;
                    for (let i = 0; i < position.line && i < lines.length; i++) {
                        offset += lines[i].length + (content.includes('\r\n') ? 2 : 1);
                    }
                    return offset + position.character;
                },
                uri: vscode.Uri.file('/path/to/test.ts')
            } as unknown as vscode.TextDocument;
        }

        test('正常な介入プランを検証・位置解決できること', () => {
            const doc = createMockDocument('function hello() {\n  functon test() {}\n}');
            const rawPlan = {
                summary: 'Fix typo',
                edits: [
                    {
                        startLine: 1,
                        startCharacter: 2,
                        endLine: 1,
                        endCharacter: 9,
                        oldText: 'functon',
                        newText: 'function',
                        category: 'SYNTAX_TYPO',
                        reason: 'Typo in keyword'
                    }
                ]
            };

            const result = validatePlan(rawPlan, doc);
            assert.strictEqual(result.summary, 'Fix typo');
            assert.strictEqual(result.edits.length, 1);
            assert.strictEqual(result.edits[0].oldText, 'functon');
            assert.strictEqual(result.edits[0].newText, 'function');
            assert.strictEqual(result.edits[0].category, 'SYNTAX_TYPO');
            assert.strictEqual(result.edits[0].startLine, 1);
            assert.strictEqual(result.edits[0].startCharacter, 2);
        });

        test('不正な形式のプランはエラーをスローすること', () => {
            const doc = createMockDocument('test');
            assert.throws(() => validatePlan(null, doc), /LLMの介入プラン形式が不正です/);
            assert.throws(() => validatePlan({}, doc), /LLMの介入プランに必要な項目がありません/);
            assert.throws(() => validatePlan({ summary: 123, edits: [] }, doc), /LLMの介入プランに必要な項目がありません/);
        });

        test('ファイル内に存在しないoldTextはエラーをスローすること', () => {
            const doc = createMockDocument('const x = 1;');
            const rawPlan = {
                summary: 'Fix invalid',
                edits: [
                    {
                        startLine: 0,
                        startCharacter: 0,
                        endLine: 0,
                        endCharacter: 5,
                        oldText: 'nonExistentCode',
                        newText: 'newCode',
                        category: 'SYNTAX_TYPO',
                        reason: 'Fix'
                    }
                ]
            };

            assert.throws(() => validatePlan(rawPlan, doc), /LLMが指定したoldTextをファイル内で見つけられません/);
        });

        test('無効なPainCategoryはエラーをスローすること', () => {
            const doc = createMockDocument('const x = 1;');
            const rawPlan = {
                summary: 'Fix category',
                edits: [
                    {
                        startLine: 0,
                        startCharacter: 0,
                        endLine: 0,
                        endCharacter: 5,
                        oldText: 'const',
                        newText: 'let',
                        category: 'INVALID_CATEGORY_NAME',
                        reason: 'Fix'
                    }
                ]
            };

            assert.throws(() => validatePlan(rawPlan, doc), /LLMの変更案に不正な値があります/);
        });
    });
});

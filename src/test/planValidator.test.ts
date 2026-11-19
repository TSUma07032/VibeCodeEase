/**
 * [Why/Intent] PlanValidator の単体テストスイート。
 * オフセット変換、位置解決、コメントアウトのみ修正の排除（isCommentOnlyEdit）、
 * および重複・オーバーラップする変更箇所の排除を検証する。
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { isCommentOnlyEdit, toOriginalOffset, validatePlan } from '../core/llm/planValidator';

function createMockDocument(content: string): vscode.TextDocument {
    const lines = content.split(/\r?\n/);
    return {
        fileName: 'test.ts',
        languageId: 'typescript',
        version: 1,
        lineCount: lines.length,
        getText: () => content,
        lineAt: (line: number) =>
            ({
                text: lines[line],
                lineNumber: line,
                range: new vscode.Range(line, 0, line, lines[line].length),
                rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
                firstNonWhitespaceCharacterIndex: 0,
                isEmptyOrWhitespace: lines[line].trim().length === 0,
            }) as vscode.TextLine,
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
        uri: vscode.Uri.file('/path/to/test.ts'),
    } as unknown as vscode.TextDocument;
}

suite('PlanValidator Test Suite', () => {
    suite('toOriginalOffset', () => {
        test('LF改行のみの場合はオフセットが一致すること', () => {
            const text = 'line 1\nline 2\nline 3';
            assert.strictEqual(toOriginalOffset(text, 0), 0);
            assert.strictEqual(toOriginalOffset(text, 7), 7);
        });

        test('CRLF改行を含む場合、正規化後のオフセットからCRLF元の位置へ正しく変換されること', () => {
            const text = 'line 1\r\nline 2\r\nline 3';
            assert.strictEqual(toOriginalOffset(text, 7), 8);
        });
    });

    suite('isCommentOnlyEdit', () => {
        test('コメントアウトのみ・TODOコメント追加のみの修正を true と判定し、実コード変更は false と判定すること', () => {
            assert.strictEqual(
                isCommentOnlyEdit('console.log(x);', '// console.log(x);'),
                true,
                '行コメントアウトのみの修正は禁止されること',
            );
            assert.strictEqual(
                isCommentOnlyEdit('console.log(x);', '/* console.log(x); */'),
                true,
                'ブロックコメントアウトのみの修正は禁止されること',
            );
            assert.strictEqual(
                isCommentOnlyEdit('{}', '{ /* TODO: エラーハンドリングを追加 */ }'),
                true,
                'TODOコメント追加のみの修正は禁止されること',
            );
            assert.strictEqual(
                isCommentOnlyEdit('var x = 1;', 'const x = 1;'),
                false,
                '実行コードの変更は許可されること',
            );
            assert.strictEqual(
                isCommentOnlyEdit('console.log(x);', ''),
                false,
                '不要コードの削除（空文字）は許可されること',
            );
        });
    });

    suite('validatePlan', () => {
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
                        reason: 'Typo in keyword',
                    },
                ],
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

        test('コメントアウトのみの編集および同一行の重複編集が除外されること', () => {
            const doc = createMockDocument('var x = 1;\nconsole.log(x);');
            const rawPlan = {
                summary: 'Clean up',
                edits: [
                    {
                        startLine: 0,
                        startCharacter: 0,
                        endLine: 0,
                        endCharacter: 10,
                        oldText: 'var x = 1;',
                        newText: 'const x = 1;',
                        category: 'VAR_FUNC_MANAGEMENT',
                        reason: 'varをconstに変更',
                    },
                    {
                        startLine: 0,
                        startCharacter: 0,
                        endLine: 0,
                        endCharacter: 3,
                        oldText: 'var',
                        newText: 'let',
                        category: 'VAR_FUNC_MANAGEMENT',
                        reason: '重複する同一行提案',
                    },
                    {
                        startLine: 1,
                        startCharacter: 0,
                        endLine: 1,
                        endCharacter: 15,
                        oldText: 'console.log(x);',
                        newText: '/* console.log(x); */',
                        category: 'VAR_FUNC_MANAGEMENT',
                        reason: 'コメントアウトのみの提案',
                    },
                ],
            };

            const result = validatePlan(rawPlan, doc);
            assert.strictEqual(result.edits.length, 1);
            assert.strictEqual(result.edits[0].newText, 'const x = 1;');
        });

        test('oldTextが複数箇所に出現する場合、startLineに最も近い箇所が選択されること', () => {
            const doc = createMockDocument('functon a() {}\nconst x = 1;\nfuncton b() {}');
            const rawPlan = {
                summary: 'Fix second occurrence',
                edits: [
                    {
                        startLine: 2,
                        startCharacter: 0,
                        endLine: 2,
                        endCharacter: 7,
                        oldText: 'functon',
                        newText: 'function',
                        category: 'SYNTAX_TYPO',
                        reason: 'Second typo',
                    },
                ],
            };
            const result = validatePlan(rawPlan, doc);
            assert.strictEqual(result.edits[0].startLine, 2);
            assert.strictEqual(result.edits[0].startCharacter, 0);
        });

        test('不正な形式・存在しないoldText・無効なカテゴリはエラーをスローすること', () => {
            const doc = createMockDocument('const x = 1;');
            assert.throws(() => validatePlan(null, doc), /LLMの介入プラン形式が不正です/);
            assert.throws(() => validatePlan({}, doc), /LLMの介入プランに必要な項目がありません/);
            assert.throws(
                () =>
                    validatePlan(
                        {
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
                                    reason: 'Fix',
                                },
                            ],
                        },
                        doc,
                    ),
                /LLMが指定したoldTextをファイル内で見つけられません/,
            );
            assert.throws(
                () =>
                    validatePlan(
                        {
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
                                    reason: 'Fix',
                                },
                            ],
                        },
                        doc,
                    ),
                /LLMの変更案に不正な値があります/,
            );
        });
    });
});

/**
 * [Why/Intent] TypeScript Compiler API を使った AST ベースの静的解析エンジン。
 * TS / JS ファイルに適用し、構文木レベルで非推奨構文・デバッグログ残留・命名規則違反・空catchブロックを検出し、
 * コメントアウト頼みではない実行可能な改善コードを提案する。
 */
import * as ts from 'typescript';
import type { AnalysisResult } from '../types';

/**
 * [Why/Intent] TypeScript AST を走査して構文構造上の改善箇所を検出するアナライザクラス。
 */
export class AstAnalyzer {
    /**
     * [Why/Intent] テキストを AST 解析し、問題を AnalysisResult[] として返す。
     * @param text ファイルのテキスト
     * @param fileName 言語判定・エラーロケーションのためのファイル名
     * @param languageId 'typescript' | 'javascript' | 'typescriptreact' | 'javascriptreact'
     */
    public analyze(text: string, fileName: string, languageId: string): AnalysisResult[] {
        // TS/JS 以外は解析スキップ
        if (!this._isSupportedLanguage(languageId)) {
            return [];
        }

        const scriptTarget = ts.ScriptTarget.Latest;
        const sourceFile = ts.createSourceFile(
            fileName,
            text,
            scriptTarget,
            /* setParentNodes */ true,
        );

        const results: AnalysisResult[] = [];

        // 各ルールに AST を通す
        this._detectVarUsage(sourceFile, results);
        this._detectConsoleLog(sourceFile, results);
        this._detectNamingConventions(sourceFile, results);
        this._detectEmptyBlock(sourceFile, results);

        return results;
    }

    /**
     * [Why/Intent] `var` 宣言を検出し `const` / `let` への移行を提案する。
     */
    private _detectVarUsage(sourceFile: ts.SourceFile, results: AnalysisResult[]): void {
        const visit = (node: ts.Node) => {
            if (ts.isVariableStatement(node)) {
                const declList = node.declarationList;
                if (!(declList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
                    const varStartPos = declList.getStart(sourceFile);
                    const hasTrailingSpace =
                        sourceFile.text.slice(varStartPos, varStartPos + 4) === 'var ';
                    const spanLength = hasTrailingSpace ? 4 : 3;
                    const start = sourceFile.getLineAndCharacterOfPosition(varStartPos);
                    const end = sourceFile.getLineAndCharacterOfPosition(varStartPos + spanLength);
                    const hasInit = declList.declarations.every((d) => d.initializer !== undefined);
                    const suggestion = hasInit ? 'const' : 'let';

                    results.push({
                        category: 'VAR_FUNC_MANAGEMENT',
                        level: 'SUGGESTION',
                        source: 'ast',
                        range: {
                            start: { line: start.line, character: start.character },
                            end: { line: end.line, character: end.character },
                        },
                        interventions: [
                            {
                                originalText: hasTrailingSpace ? 'var ' : 'var',
                                replacementText: hasTrailingSpace ? `${suggestion} ` : suggestion,
                                message: `varを${suggestion}に変更してスコープを明確化\n\`var\` は非推奨です。\`${suggestion}\` を使用するとブロックスコープが明確になり、意図しない再代入を防げます。`,
                            },
                        ],
                    });
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(sourceFile, visit);
    }

    /**
     * [Why/Intent] `console.log(...)` 呼び出しを検出し、コメントアウトではなく不要なデバッグ呼び出しの削除を提案する。
     */
    private _detectConsoleLog(sourceFile: ts.SourceFile, results: AnalysisResult[]): void {
        const visit = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                ts.isIdentifier(node.expression.expression) &&
                node.expression.expression.text === 'console' &&
                (node.expression.name.text === 'log' ||
                    node.expression.name.text === 'debug' ||
                    node.expression.name.text === 'warn')
            ) {
                const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
                const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
                const methodName = node.expression.name.text;
                const callText = node.getText(sourceFile);

                results.push({
                    category: 'VAR_FUNC_MANAGEMENT',
                    level: 'SUGGESTION',
                    source: 'ast',
                    range: {
                        start: { line: start.line, character: start.character },
                        end: { line: end.line, character: end.character },
                    },
                    interventions: [
                        {
                            originalText: callText,
                            replacementText: '',
                            message: `デバッグ用のconsole.${methodName}呼び出しを削除\nデバッグ用コード \`console.${methodName}\` が残っています。本番コードでは削除を検討してください。`,
                        },
                    ],
                });
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(sourceFile, visit);
    }

    /**
     * [Why/Intent] 関数宣言と変数宣言の名前が snake_case の場合に camelCase への変換を提案する。
     */
    private _detectNamingConventions(sourceFile: ts.SourceFile, results: AnalysisResult[]): void {
        const snakeCasePattern = /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*)+$/;

        const visit = (node: ts.Node) => {
            if (ts.isFunctionDeclaration(node) && node.name) {
                const name = node.name.text;
                if (snakeCasePattern.test(name)) {
                    const start = sourceFile.getLineAndCharacterOfPosition(
                        node.name.getStart(sourceFile),
                    );
                    const end = sourceFile.getLineAndCharacterOfPosition(node.name.getEnd());
                    const camel = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
                    results.push({
                        category: 'VAR_FUNC_MANAGEMENT',
                        level: 'SUGGESTION',
                        source: 'ast',
                        range: {
                            start: { line: start.line, character: start.character },
                            end: { line: end.line, character: end.character },
                        },
                        interventions: [
                            {
                                originalText: name,
                                replacementText: camel,
                                message: `関数名をcamelCase（${camel}）に統一\nJS/TSでは関数名に \`camelCase\` を使います。\`${name}\` → \`${camel}\` への変更を検討してください。`,
                            },
                        ],
                    });
                }
            }

            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                const name = node.name.text;
                if (snakeCasePattern.test(name)) {
                    const start = sourceFile.getLineAndCharacterOfPosition(
                        node.name.getStart(sourceFile),
                    );
                    const end = sourceFile.getLineAndCharacterOfPosition(node.name.getEnd());
                    const camel = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
                    results.push({
                        category: 'VAR_FUNC_MANAGEMENT',
                        level: 'SUGGESTION',
                        source: 'ast',
                        range: {
                            start: { line: start.line, character: start.character },
                            end: { line: end.line, character: end.character },
                        },
                        interventions: [
                            {
                                originalText: name,
                                replacementText: camel,
                                message: `変数名をcamelCase（${camel}）に統一\nJS/TSでは変数名に \`camelCase\` を使います。\`${name}\` → \`${camel}\` への変更を検討してください。`,
                            },
                        ],
                    });
                }
            }

            ts.forEachChild(node, visit);
        };
        ts.forEachChild(sourceFile, visit);
    }

    /**
     * [Why/Intent] 空の catch ブロックを検出し、TODOコメントではなく実行可能なエラーログ出力コードを提案する。
     */
    private _detectEmptyBlock(sourceFile: ts.SourceFile, results: AnalysisResult[]): void {
        const visit = (node: ts.Node) => {
            if (ts.isTryStatement(node) && node.catchClause?.block.statements.length === 0) {
                const block = node.catchClause.block;
                const start = sourceFile.getLineAndCharacterOfPosition(block.getStart(sourceFile));
                const end = sourceFile.getLineAndCharacterOfPosition(block.getEnd());
                const varDecl = node.catchClause.variableDeclaration;
                const errName =
                    varDecl && ts.isIdentifier(varDecl.name) ? varDecl.name.text : 'error';

                results.push({
                    category: 'SYNTAX_ERROR_HANDLING',
                    level: 'SUGGESTION',
                    source: 'ast',
                    range: {
                        start: { line: start.line, character: start.character },
                        end: { line: end.line, character: end.character },
                    },
                    interventions: [
                        {
                            originalText: block.getText(sourceFile),
                            replacementText: `{ console.error(${errName}); }`,
                            message: `空のcatch節にエラーログ出力を追加\n空の catch ブロックはエラーを無視してしまいます。少なくとも \`console.error(${errName})\` を入れるか、エラーを再スローすることを検討してください。`,
                        },
                    ],
                });
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(sourceFile, visit);
    }

    private _isSupportedLanguage(languageId: string): boolean {
        return ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(
            languageId,
        );
    }
}

import * as ts from 'typescript';
import { AnalysisResult, PainCategory } from '../types';

/**
 * TypeScript Compiler API を使った AST ベースの静的解析。
 * TS / JS ファイルにのみ適用し、ルールベース解析では検出できない
 * 「構文構造を理解した」問題を検出する。
 */
export class AstAnalyzer {

  /**
   * テキストを AST 解析し、問題を AnalysisResult[] として返す。
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
    const sourceFile = ts.createSourceFile(fileName, text, scriptTarget, /* setParentNodes */ true);

    const results: AnalysisResult[] = [];

    // 各ルールに AST を通す
    this._detectVarUsage(sourceFile, results);
    this._detectConsoleLog(sourceFile, results);
    this._detectNamingConventions(sourceFile, results);
    this._detectEmptyBlock(sourceFile, results);

    return results;
  }

  // ─── ルール: var 宣言の検出 ──────────────────────────────────────
  /**
   * `var` 宣言を検出し `const` / `let` への移行を提案する。
   */
  private _detectVarUsage(sourceFile: ts.SourceFile, results: AnalysisResult[]): void {
    const visit = (node: ts.Node) => {
      if (ts.isVariableStatement(node)) {
        const declList = node.declarationList;
        if (declList.flags & ts.NodeFlags.None &&
            !(declList.flags & ts.NodeFlags.Let) &&
            !(declList.flags & ts.NodeFlags.Const)) {
          // var 宣言
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
          // 初期化子があれば const、なければ let を提案
          const hasInit = declList.declarations.every(d => d.initializer !== undefined);
          const suggestion = hasInit ? 'const' : 'let';

          results.push({
            category: 'VAR_FUNC_MANAGEMENT',
            level: 'SUGGESTION',
            source: 'ast',
            range: {
              start: { line: start.line, character: start.character },
              end: { line: end.line, character: end.character }
            },
            interventions: [{
              originalText: 'var ',
              replacementText: `${suggestion} `,
              message: `🌲 **\`var\` は非推奨**: \`${suggestion}\` の使用を検討してください。スコープが明確になり、意図しない再代入を防げます。`
            }]
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  // ─── ルール: console.log の検出 ─────────────────────────────────
  /**
   * `console.log(...)` 呼び出しを検出し、デバッグコードを残していないか警告する。
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

        results.push({
          category: 'VAR_FUNC_MANAGEMENT',
          level: 'SUGGESTION',
          source: 'ast',
          range: {
            start: { line: start.line, character: start.character },
            end: { line: end.line, character: end.character }
          },
          interventions: [{
            originalText: `console.${methodName}`,
            replacementText: '',
            message: `🌲 **デバッグ用コード** \`console.${methodName}\` が残っています。本番コードでは削除を検討してください。`
          }]
        });
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  // ─── ルール: 命名規則（関数・変数名） ───────────────────────────
  /**
   * 関数宣言と変数宣言の名前が camelCase か PascalCase かを検証する。
   * snake_case や SCREAMING_SNAKE_CASE は JS の一般的な慣習に外れる。
   * ただし定数 (CONST) の SCREAMING_SNAKE は許容する。
   */
  private _detectNamingConventions(sourceFile: ts.SourceFile, results: AnalysisResult[]): void {
    const snakeCasePattern = /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*)+$/;

    const visit = (node: ts.Node) => {
      // 関数宣言: function my_function() {}
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        if (snakeCasePattern.test(name)) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.name.getStart(sourceFile));
          const end = sourceFile.getLineAndCharacterOfPosition(node.name.getEnd());
          const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          results.push({
            category: 'VAR_FUNC_MANAGEMENT',
            level: 'SUGGESTION',
            source: 'ast',
            range: {
              start: { line: start.line, character: start.character },
              end: { line: end.line, character: end.character }
            },
            interventions: [{
              originalText: name,
              replacementText: camel,
              message: `🌲 **命名規則**: JS では関数名に \`camelCase\` を使います。\`${name}\` → \`${camel}\` はいかがですか？`
            }]
          });
        }
      }

      // 変数宣言: let my_variable = ...
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        if (snakeCasePattern.test(name)) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.name.getStart(sourceFile));
          const end = sourceFile.getLineAndCharacterOfPosition(node.name.getEnd());
          const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          results.push({
            category: 'VAR_FUNC_MANAGEMENT',
            level: 'SUGGESTION',
            source: 'ast',
            range: {
              start: { line: start.line, character: start.character },
              end: { line: end.line, character: end.character }
            },
            interventions: [{
              originalText: name,
              replacementText: camel,
              message: `🌲 **命名規則**: JS では変数名に \`camelCase\` を使います。\`${name}\` → \`${camel}\` はいかがですか？`
            }]
          });
        }
      }

      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  // ─── ルール: 空の catch ブロック ─────────────────────────────────
  /**
   * `catch(e) {}` のような空の catch ブロックを検出する。
   * エラーを無視する実装はデバッグを困難にする。
   */
  private _detectEmptyBlock(sourceFile: ts.SourceFile, results: AnalysisResult[]): void {
    const visit = (node: ts.Node) => {
      if (
        ts.isTryStatement(node) &&
        node.catchClause &&
        node.catchClause.block.statements.length === 0
      ) {
        const clause = node.catchClause;
        const start = sourceFile.getLineAndCharacterOfPosition(clause.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(clause.getEnd());

        results.push({
          category: 'SYNTAX_ERROR_HANDLING',
          level: 'SUGGESTION',
          source: 'ast',
          range: {
            start: { line: start.line, character: start.character },
            end: { line: end.line, character: end.character }
          },
          interventions: [{
            originalText: '',
            replacementText: '',
            message: '🌲 **空の catch ブロック**: エラーを無視しています。少なくとも `console.error(e)` を入れるか、エラーを再スローすることを検討してください。'
          }]
        });
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  private _isSupportedLanguage(languageId: string): boolean {
    return ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(languageId);
  }
}

import * as assert from 'node:assert';
import { AstAnalyzer } from '../core/astAnalyzer';

suite('AstAnalyzer Test Suite', () => {
    let astAnalyzer: AstAnalyzer;

    setup(() => {
        astAnalyzer = new AstAnalyzer();
    });

    test('var 宣言を検出し、変数代入を破壊せず var キーワードのみの範囲を返すこと', () => {
        const code = 'var count = 42;\nconst ok = 1;';
        const results = astAnalyzer.analyze(code, 'sample.ts', 'typescript');
        const varHit = results.find(
            (r) =>
                r.category === 'VAR_FUNC_MANAGEMENT' &&
                r.interventions[0]?.replacementText === 'const ',
        );
        assert.ok(varHit, 'var 宣言が検出されること');
        assert.strictEqual(varHit.interventions[0].originalText, 'var ');
        assert.strictEqual(varHit.range.start.line, 0);
        assert.strictEqual(varHit.range.start.character, 0);
        assert.strictEqual(varHit.range.end.line, 0);
        assert.strictEqual(varHit.range.end.character, 4);
    });

    test('console.log / debug / warn を検出し、元の呼び出し文字列全体を originalText として保持すること', () => {
        const code = 'function run() {\n  console.log("debug value");\n}';
        const results = astAnalyzer.analyze(code, 'sample.ts', 'typescript');
        const logHit = results.find((r) => r.interventions[0]?.message?.includes('console.log'));
        assert.ok(logHit);
        assert.strictEqual(logHit.interventions[0].originalText, 'console.log("debug value")');
        assert.strictEqual(
            logHit.interventions[0].replacementText,
            '/* console.log("debug value") */',
        );
    });

    test('snake_case の関数名・変数名を検出し camelCase への変換を提案すること', () => {
        const code = 'function fetch_user_data() {\n  const user_id = 1;\n  return user_id;\n}';
        const results = astAnalyzer.analyze(code, 'sample.tsx', 'typescriptreact');
        const fnHit = results.find((r) => r.interventions[0]?.originalText === 'fetch_user_data');
        const varHit = results.find((r) => r.interventions[0]?.originalText === 'user_id');
        assert.ok(fnHit);
        assert.strictEqual(fnHit.interventions[0].replacementText, 'fetchUserData');
        assert.ok(varHit);
        assert.strictEqual(varHit.interventions[0].replacementText, 'userId');
    });

    test('UPPER_SNAKE_CASE の定数は命名規則違反として誤検知しないこと', () => {
        const code = 'const MAX_RETRY_COUNT = 5;';
        const results = astAnalyzer.analyze(code, 'sample.ts', 'typescript');
        assert.strictEqual(results.length, 0);
    });

    test('空の catch ブロックを検出し、catch ブロック範囲のみを置換対象とすること', () => {
        const code = 'try {\n  doWork();\n} catch (err) {}';
        const results = astAnalyzer.analyze(code, 'sample.js', 'javascript');
        const catchHit = results.find((r) => r.category === 'SYNTAX_ERROR_HANDLING');
        assert.ok(catchHit);
        assert.strictEqual(catchHit.interventions[0].originalText, '{}');
        assert.strictEqual(
            catchHit.interventions[0].replacementText,
            '{ /* TODO: エラーハンドリングを追加 */ }',
        );
    });

    test('サポート外の言語（python 等）では空配列を返すこと', () => {
        const code = 'var x = 1;\nconsole.log(x);';
        const results = astAnalyzer.analyze(code, 'sample.py', 'python');
        assert.strictEqual(results.length, 0);
    });
});

import * as assert from 'node:assert';
import { CodeAnalyzer } from '../core/analyzer';
import type { AnalysisResult } from '../types';

function registerBasicTests(getAnalyzer: () => CodeAnalyzer): void {
    test('should detect "functon" typo', () => {
        const code = `export functon myTest() {\n  return 1;\n}`;
        const results = getAnalyzer().analyze(code);
        const typoResults = results.filter((r) => r.interventions[0]?.originalText === 'functon');
        assert.strictEqual(typoResults.length, 1);

        const result: AnalysisResult = typoResults[0];
        assert.strictEqual(result.category, 'SYNTAX_TYPO');
        assert.strictEqual(result.level, 'SUGGESTION');
        assert.strictEqual(result.range.start.line, 0);
        assert.strictEqual(result.range.start.character, 7);
        assert.strictEqual(result.range.end.character, 14);
        assert.strictEqual(result.interventions[0].originalText, 'functon');
        assert.strictEqual(result.interventions[0].replacementText, 'function');
    });

    test('should detect multiple typos on same line', () => {
        const code = `functon one() {}; functon two() {};`;
        const results = getAnalyzer().analyze(code);
        const functonResults = results.filter(
            (r) => r.interventions[0]?.originalText === 'functon',
        );
        assert.strictEqual(functonResults.length, 2);
        assert.strictEqual(functonResults[0].range.start.character, 0);
        assert.strictEqual(functonResults[1].range.start.character, 18);
    });

    test('should support custom typo rules', () => {
        const customAnalyzer = new CodeAnalyzer([
            { pattern: 'retrun', replacement: 'return', category: 'SYNTAX_TYPO' },
        ]);
        const results = customAnalyzer.analyze('retrun false;');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].interventions[0].originalText, 'retrun');
        assert.strictEqual(results[0].interventions[0].replacementText, 'return');
    });
}

function registerKeywordTests(getAnalyzer: () => CodeAnalyzer): void {
    suite('新キーワードタイポルール', () => {
        test('retrun / reutrn を return として検出すること', () => {
            const r1 = getAnalyzer().analyze('  retrun false;');
            assert.strictEqual(r1[0]?.interventions[0]?.replacementText, 'return');
            const r2 = getAnalyzer().analyze('reutrn null;');
            assert.strictEqual(r2[0]?.interventions[0]?.replacementText, 'return');
        });

        test('consoel. / thsi. を検出すること', () => {
            const r1 = getAnalyzer().analyze('consoel.log("hello");');
            assert.strictEqual(r1[0]?.interventions[0]?.replacementText, 'console.');
            const r2 = getAnalyzer().analyze('thsi.name = "test";');
            assert.strictEqual(r2[0]?.interventions[0]?.replacementText, 'this.');
        });

        test('ture / flase / awiat / conts を検出すること', () => {
            assert.ok(
                getAnalyzer()
                    .analyze('const flag = ture;')
                    .some((r) => r.interventions[0]?.replacementText === 'true'),
            );
            assert.ok(
                getAnalyzer()
                    .analyze('return flase;')
                    .some((r) => r.interventions[0]?.replacementText === 'false'),
            );
            assert.ok(
                getAnalyzer()
                    .analyze('const res = awiat fetch(url);')
                    .some((r) => r.interventions[0]?.originalText === 'awiat '),
            );
            assert.ok(
                getAnalyzer()
                    .analyze('conts x = 1;')
                    .some((r) => r.interventions[0]?.replacementText === 'const '),
            );
        });

        test('英単語の一部（feature, structure, future, signature）を ture タイポと誤検知しないこと', () => {
            const code = 'const feature = structure.future + signature;';
            const results = getAnalyzer().analyze(code);
            assert.strictEqual(results.length, 0);
        });
    });
}

function registerFormattingAndLanguageTests(getAnalyzer: () => CodeAnalyzer): void {
    suite('記号・空白・言語フィルタ', () => {
        test('= > (スペース入り) を => として検出すること', () => {
            const results = getAnalyzer().analyze('const fn = (x) = > x + 1;');
            const hit = results.find((r) => r.interventions[0]?.originalText === '= >');
            assert.ok(hit);
            assert.strictEqual(hit.interventions[0].replacementText, '=>');
        });

        test('行末の余分なスペースおよび3行以上の連続空行を検出すること', () => {
            const trailing = getAnalyzer().analyze('const x = 1;   ');
            assert.ok(trailing.some((r) => r.interventions[0]?.replacementText === ''));

            const blankLines = getAnalyzer().analyze('const a = 1;\n\n\n\nconst b = 2;');
            assert.ok(
                blankLines.some((r) => r.interventions[0]?.message?.includes('連続した空行')),
            );
        });

        test('Python限定ルール (if condtion:) は python 言語でのみ検出されること', () => {
            const code = 'if condtion:\n    pass';
            const pyResults = getAnalyzer().analyze(code, 'python');
            const jsResults = getAnalyzer().analyze(code, 'javascript');
            assert.ok(pyResults.some((r) => r.interventions[0]?.originalText === 'if condtion:'));
            assert.ok(!jsResults.some((r) => r.interventions[0]?.originalText === 'if condtion:'));
        });

        test('タイポ・フォーマット違反がないコードでは空配列を返すこと', () => {
            const code = `export function myTest() {\n  if (condition) return 1;\n}`;
            assert.strictEqual(getAnalyzer().analyze(code).length, 0);
        });
    });
}

suite('CodeAnalyzer Test Suite', () => {
    let analyzer: CodeAnalyzer;

    setup(() => {
        analyzer = new CodeAnalyzer();
    });

    registerBasicTests(() => analyzer);
    registerKeywordTests(() => analyzer);
    registerFormattingAndLanguageTests(() => analyzer);
});

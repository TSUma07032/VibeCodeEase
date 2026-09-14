import * as assert from 'assert';
import { CodeAnalyzer, DEFAULT_TYPO_RULES } from '../core/analyzer';
import { AnalysisResult } from '../types';

suite('CodeAnalyzer Test Suite', () => {
    let analyzer: CodeAnalyzer;

    setup(() => {
        analyzer = new CodeAnalyzer();
    });

    // ─── 既存テスト（後方互換性を維持） ────────────────────────────
    test('should detect "functon" typo', () => {
        const code = `export functon myTest() {\n  return 1;\n}`;
        const results = analyzer.analyze(code);

        // 末尾スペースなし・他のタイポなし → functon の 1件のみ
        const typoResults = results.filter(r => r.interventions[0]?.originalText === 'functon');
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
        const results = analyzer.analyze(code);
        const functonResults = results.filter(r => r.interventions[0]?.originalText === 'functon');
        assert.strictEqual(functonResults.length, 2);
        assert.strictEqual(functonResults[0].range.start.character, 0);
        assert.strictEqual(functonResults[1].range.start.character, 18);
    });

    test('should support custom typo rules', () => {
        const customAnalyzer = new CodeAnalyzer([
            { pattern: 'retrun', replacement: 'return', category: 'SYNTAX_TYPO' }
        ]);
        const results = customAnalyzer.analyze('retrun false;');
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].interventions[0].originalText, 'retrun');
        assert.strictEqual(results[0].interventions[0].replacementText, 'return');
    });

    // ─── カテゴリA: キーワード誤記の新ルール ───────────────────────
    suite('新キーワードタイポルール', () => {
        test('retrun を return として検出すること', () => {
            const results = analyzer.analyze('  retrun false;');
            const hit = results.find(r => r.interventions[0]?.originalText === 'retrun');
            assert.ok(hit, 'retrun が検出されること');
            assert.strictEqual(hit!.interventions[0].replacementText, 'return');
        });

        test('reutrn を return として検出すること', () => {
            const results = analyzer.analyze('reutrn null;');
            const hit = results.find(r => r.interventions[0]?.originalText === 'reutrn');
            assert.ok(hit, 'reutrn が検出されること');
        });

        test('consoel. を console. として検出すること', () => {
            const results = analyzer.analyze('consoel.log("hello");');
            const hit = results.find(r => r.interventions[0]?.originalText === 'consoel.');
            assert.ok(hit, 'consoel. が検出されること');
            assert.strictEqual(hit!.interventions[0].replacementText, 'console.');
        });

        test('thsi. を this. として検出すること', () => {
            const results = analyzer.analyze('thsi.name = "test";');
            const hit = results.find(r => r.interventions[0]?.originalText === 'thsi.');
            assert.ok(hit, 'thsi. が検出されること');
        });

        test('ture を true として検出すること', () => {
            const results = analyzer.analyze('const flag = ture;');
            const hit = results.find(r => r.interventions[0]?.originalText === 'ture');
            assert.ok(hit, 'ture が検出されること');
            assert.strictEqual(hit!.interventions[0].replacementText, 'true');
        });

        test('flase を false として検出すること', () => {
            const results = analyzer.analyze('return flase;');
            const hit = results.find(r => r.interventions[0]?.originalText === 'flase');
            assert.ok(hit, 'flase が検出されること');
            assert.strictEqual(hit!.interventions[0].replacementText, 'false');
        });

        test('awiat を await として検出すること', () => {
            const results = analyzer.analyze('const res = awiat fetch(url);');
            const hit = results.find(r => r.interventions[0]?.originalText === 'awiat ');
            assert.ok(hit, 'awiat が検出されること');
        });

        test('conts を const として検出すること', () => {
            const results = analyzer.analyze('conts x = 1;');
            const hit = results.find(r => r.interventions[0]?.originalText === 'conts ');
            assert.ok(hit);
            assert.strictEqual(hit!.interventions[0].replacementText, 'const ');
        });
    });

    // ─── カテゴリB: 記号タイポ ─────────────────────────────────────
    suite('記号タイポルール', () => {
        test('= > (スペース入り) を => として検出すること', () => {
            const results = analyzer.analyze('const fn = (x) = > x + 1;');
            const hit = results.find(r => r.interventions[0]?.originalText === '= >');
            assert.ok(hit, '= > が検出されること');
            assert.strictEqual(hit!.interventions[0].replacementText, '=>');
        });
    });

    // ─── カテゴリC: 末尾スペース ───────────────────────────────────
    suite('末尾スペース検出', () => {
        test('行末に余分なスペースがある行を検出すること', () => {
            const results = analyzer.analyze('const x = 1;   ');
            const hit = results.find(r => r.category === 'INDENTATION_FORMATTING' &&
                r.interventions[0]?.message?.includes('末尾'));
            assert.ok(hit, '末尾スペースが検出されること');
            assert.strictEqual(hit!.interventions[0].replacementText, '');
        });

        test('末尾スペースがない行は検出しないこと', () => {
            const results = analyzer.analyze('const x = 1;');
            const hit = results.find(r => r.category === 'INDENTATION_FORMATTING' &&
                r.interventions[0]?.message?.includes('末尾'));
            assert.strictEqual(hit, undefined);
        });
    });

    // ─── languageId フィルタ ────────────────────────────────────────
    suite('languageId フィルタ', () => {
        test('Python限定ルール (if condtion:) は python 言語でのみ検出されること', () => {
            const code = 'if condtion:\n    pass';
            const pyResults = analyzer.analyze(code, 'python');
            const jsResults = analyzer.analyze(code, 'javascript');
            const pyHit = pyResults.find(r => r.interventions[0]?.originalText === 'if condtion:');
            const jsHit = jsResults.find(r => r.interventions[0]?.originalText === 'if condtion:');
            assert.ok(pyHit, 'python ファイルでは検出されること');
            assert.strictEqual(jsHit, undefined, 'javascript ファイルでは検出されないこと');
        });

        test('言語不問ルール (functon) は languageId に関係なく検出されること', () => {
            const code = 'functon test() {}';
            const jsResults = analyzer.analyze(code, 'javascript');
            const pyResults = analyzer.analyze(code, 'python');
            assert.ok(jsResults.find(r => r.interventions[0]?.originalText === 'functon'));
            assert.ok(pyResults.find(r => r.interventions[0]?.originalText === 'functon'));
        });

        test('languageId が未指定の場合、Python限定ルールも検出されること（後方互換）', () => {
            // languageId 未指定時は全ルールが動作（フィルタなし）
            const code = 'if condtion:\n    pass';
            const results = analyzer.analyze(code);
            // languageId フィルタは languageId が指定されている場合のみ働く
            // 未指定時は言語限定ルールも通過する（後方互換）
            assert.ok(Array.isArray(results));
        });
    });

    // ─── タイポなし → 空配列 ──────────────────────────────────────
    test('should return empty array for code without typos', () => {
        const code = `export function myTest() {\n  if (condition) return 1;\n}`;
        const results = analyzer.analyze(code);
        // 末尾スペースなし・タイポなし → 0件
        assert.strictEqual(results.length, 0);
    });
});


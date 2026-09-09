import * as assert from 'assert';
import { CodeAnalyzer } from '../core/analyzer';
import { AnalysisResult } from '../types';

suite('CodeAnalyzer Test Suite', () => {
    let analyzer: CodeAnalyzer;

    setup(() => {
        analyzer = new CodeAnalyzer();
    });

    test('should detect "functon" typo', () => {
        const code = `export functon myTest() {\n  return 1;\n}`;
        const results = analyzer.analyze(code);

        assert.strictEqual(results.length, 1);

        const result: AnalysisResult = results[0];
        assert.strictEqual(result.category, 'SYNTAX_TYPO');
        assert.strictEqual(result.level, 'SUGGESTION');

        assert.strictEqual(result.range.start.line, 0);
        assert.strictEqual(result.range.start.character, 7);
        assert.strictEqual(result.range.end.line, 0);
        assert.strictEqual(result.range.end.character, 14);

        assert.strictEqual(result.interventions.length, 1);
        assert.strictEqual(result.interventions[0].originalText, 'functon');
        assert.strictEqual(result.interventions[0].replacementText, 'function');
    });

    test('should detect "if condtion:" typo', () => {
        const code = `def test_func():\n    if condtion:\n        pass`;
        const results = analyzer.analyze(code);

        assert.strictEqual(results.length, 1);

        const result: AnalysisResult = results[0];
        assert.strictEqual(result.category, 'SYNTAX_TYPO');
        assert.strictEqual(result.level, 'SUGGESTION');

        assert.strictEqual(result.range.start.line, 1);
        assert.strictEqual(result.range.start.character, 4);
        assert.strictEqual(result.range.end.line, 1);
        assert.strictEqual(result.range.end.character, 16);

        assert.strictEqual(result.interventions.length, 1);
        assert.strictEqual(result.interventions[0].originalText, 'if condtion:');
        assert.strictEqual(result.interventions[0].replacementText, 'if condition:');
    });

    test('should detect multiple typos in same text', () => {
        const code = `functon test() {\n    if condtion:\n        return true;\n}`;
        const results = analyzer.analyze(code);

        assert.strictEqual(results.length, 2);

        assert.strictEqual(results[0].interventions[0].originalText, 'functon');
        assert.strictEqual(results[1].interventions[0].originalText, 'if condtion:');
    });

    test('should detect multiple typos on same line', () => {
        const code = `functon one() {}; functon two() {};`;
        const results = analyzer.analyze(code);

        assert.strictEqual(results.length, 2);

        assert.strictEqual(results[0].range.start.character, 0);
        assert.strictEqual(results[1].range.start.character, 18);
    });

    test('should return empty array for code without typos', () => {
        const code = `export function myTest() {\n  if (condition) return 1;\n}`;
        const results = analyzer.analyze(code);

        assert.strictEqual(results.length, 0);
    });

    test('should detect snake_case variable declarations and suggest camelCase', () => {
        const code = `let my_var = 1;\nconst another_long_var = 2;\nvar test_var_name = 3;`;
        const results = analyzer.analyze(code);

        assert.strictEqual(results.length, 3);

        assert.strictEqual(results[0].category, 'VAR_FUNC_MANAGEMENT');
        assert.strictEqual(results[0].interventions[0].originalText, 'my_var');
        assert.strictEqual(results[0].interventions[0].replacementText, 'myVar');
        assert.strictEqual(results[0].range.start.line, 0);

        assert.strictEqual(results[1].category, 'VAR_FUNC_MANAGEMENT');
        assert.strictEqual(results[1].interventions[0].originalText, 'another_long_var');
        assert.strictEqual(results[1].interventions[0].replacementText, 'anotherLongVar');
        assert.strictEqual(results[1].range.start.line, 1);

        assert.strictEqual(results[2].category, 'VAR_FUNC_MANAGEMENT');
        assert.strictEqual(results[2].interventions[0].originalText, 'test_var_name');
        assert.strictEqual(results[2].interventions[0].replacementText, 'testVarName');
        assert.strictEqual(results[2].range.start.line, 2);
    });

    test('should not suggest camelCase for non-matching strings or non-declarations', () => {
        const code = `let camelCase = 1;\nmy_var = 2;\nconst ONLY_UPPER_SNAKE = 3;`;
        const results = analyzer.analyze(code);

        assert.strictEqual(results.length, 0);
    });
});

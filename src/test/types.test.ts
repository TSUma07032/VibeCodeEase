import * as assert from 'assert';
import { parsePainCategory, clampPreferenceValue } from '../types/utils';

suite('Types Utils Test Suite', () => {
  suite('parsePainCategory', () => {
    test('有効な PainCategory の場合はそのまま返すこと', () => {
      assert.strictEqual(parsePainCategory('SYNTAX_TYPO'), 'SYNTAX_TYPO');
      assert.strictEqual(parsePainCategory('INDENTATION_FORMATTING'), 'INDENTATION_FORMATTING');
      assert.strictEqual(parsePainCategory('VAR_FUNC_MANAGEMENT'), 'VAR_FUNC_MANAGEMENT');
      assert.strictEqual(parsePainCategory('SYNTAX_ERROR_HANDLING'), 'SYNTAX_ERROR_HANDLING');
    });

    test('無効なカテゴリ文字列の場合はデフォルト値にフォールバックすること', () => {
      assert.strictEqual(parsePainCategory('INVALID_CATEGORY'), 'SYNTAX_TYPO');
      assert.strictEqual(parsePainCategory(''), 'SYNTAX_TYPO');
    });

    test('カスタムのデフォルト値を指定した場合、無効な入力でそれが返ること', () => {
      assert.strictEqual(parsePainCategory('UNKNOWN', 'VAR_FUNC_MANAGEMENT'), 'VAR_FUNC_MANAGEMENT');
    });
  });

  suite('clampPreferenceValue', () => {
    test('0.0〜1.0 の範囲内の数値はそのまま返すこと', () => {
      assert.strictEqual(clampPreferenceValue(0.0), 0.0);
      assert.strictEqual(clampPreferenceValue(0.5), 0.5);
      assert.strictEqual(clampPreferenceValue(1.0), 1.0);
    });

    test('0.0未満の数値は0.0に補正されること', () => {
      assert.strictEqual(clampPreferenceValue(-0.1), 0.0);
      assert.strictEqual(clampPreferenceValue(-100), 0.0);
    });

    test('1.0より大きい数値は1.0に補正されること', () => {
      assert.strictEqual(clampPreferenceValue(1.1), 1.0);
      assert.strictEqual(clampPreferenceValue(100), 1.0);
    });

    test('数値以外の値やNaNが渡された場合はデフォルト値（0.5）が返ること', () => {
      assert.strictEqual(clampPreferenceValue(undefined), 0.5);
      assert.strictEqual(clampPreferenceValue(null), 0.5);
      assert.strictEqual(clampPreferenceValue('0.5'), 0.5);
      assert.strictEqual(clampPreferenceValue(NaN), 0.5);
    });

    test('カスタムのデフォルト値を指定した場合、無効な入力でそれが返ること', () => {
      assert.strictEqual(clampPreferenceValue(undefined, 0.8), 0.8);
      assert.strictEqual(clampPreferenceValue(NaN, 0.2), 0.2);
    });
  });
});

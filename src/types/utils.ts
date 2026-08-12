import { PainCategory, PAIN_CATEGORIES } from './painCategory';

/**
 * 未知の文字列をPainCategoryに変換するユーティリティ関数。
 * 無効な値が渡された場合はデフォルトのカテゴリにフォールバックします。
 *
 * @param category 判定するカテゴリ文字列
 * @param defaultFallback フォールバック先のPainCategory (デフォルト: 'SYNTAX_TYPO')
 * @returns 有効なPainCategory
 */
export function parsePainCategory(
  category: string,
  defaultFallback: PainCategory = 'SYNTAX_TYPO'
): PainCategory {
  if (PAIN_CATEGORIES.includes(category as PainCategory)) {
    return category as PainCategory;
  }
  return defaultFallback;
}

/**
 * ユーザーの嗜好値（0.0〜1.0）を検証・補正するユーティリティ関数。
 * 範囲外の数値が渡された場合は、0.0〜1.0の範囲内にクランプします。
 * 数値以外やNaNが渡された場合はデフォルト値を返します。
 *
 * @param value 判定する嗜好値
 * @param defaultValue 不正な値（NaN等）の場合のデフォルト値 (デフォルト: 0.5)
 * @returns 0.0〜1.0の範囲に補正された数値
 */
export function clampPreferenceValue(value: unknown, defaultValue: number = 0.5): number {
  if (typeof value !== 'number' || isNaN(value)) {
    return defaultValue;
  }
  if (value < 0.0) {
    return 0.0;
  }
  if (value > 1.0) {
    return 1.0;
  }
  return value;
}

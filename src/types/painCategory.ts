/**
 * システムが検知する「わずらわしさ」のカテゴリ
 */
export type PainCategory =
  | 'SYNTAX_TYPO'              // タイポや細かい構文ミス
  | 'INDENTATION_FORMATTING'   // インデントや整形
  | 'VAR_FUNC_MANAGEMENT'      // 変数や関数の管理（命名、宣言など）
  | 'SYNTAX_ERROR_HANDLING';   // ブロック構文などの重大な構文エラー

/**
 * 有効な PainCategory のリスト
 */
export const PAIN_CATEGORIES: PainCategory[] = [
  'SYNTAX_TYPO',
  'INDENTATION_FORMATTING',
  'VAR_FUNC_MANAGEMENT',
  'SYNTAX_ERROR_HANDLING'
];

/**
 * PainCategory の人間向け表示名（日本語）
 */
export const PAIN_CATEGORY_LABELS: Record<PainCategory, string> = {
  SYNTAX_TYPO: 'タイポ・誤記',
  INDENTATION_FORMATTING: 'インデント・整形',
  VAR_FUNC_MANAGEMENT: '変数・関数の管理',
  SYNTAX_ERROR_HANDLING: '構文エラー・ブロック'
};


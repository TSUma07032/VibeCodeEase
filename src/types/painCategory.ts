/**
 * システムが検知する「わずらわしさ」の種類
 */
export type PainCategory =
  | 'SYNTAX_RIGOR'       // 構文の厳密さ
  | 'FORMATTING'         // インデントや整形
  | 'NAMING_MANAGEMENT'  // 変数名や関数名の管理
  | 'SYNTAX_ERROR';      // 構文エラー

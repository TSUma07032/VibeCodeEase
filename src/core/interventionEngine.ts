import { PainCategory, InterventionLevel, UserPreferenceProfile, PresetMode, clampPreferenceValue } from '../types';

/**
 * 介入レベル判定のしきい値
 */
export const INTERVENTION_THRESHOLDS = {
  SILENT_MIN: 0.75,       // 0.75以上: サイレント自動修正
  SUGGESTION_MIN: 0.40    // 0.40以上0.75未満: サジェスト提案 (0.40未満は IGNORE)
} as const;

/**
 * 後方互換性としきい値参照用の定数
 */
export const THRESHOLDS = {
  IGNORE_MAX: INTERVENTION_THRESHOLDS.SUGGESTION_MIN, // 0.40
  SUGGESTION_MAX: INTERVENTION_THRESHOLDS.SILENT_MIN, // 0.75
} as const;

export class InterventionEngine {
  /**
   * 単一カテゴリの嗜好値（0.0〜1.0）から介入レベル（SILENT / SUGGESTION / IGNORE）を判定する純粋関数
   */
  public static determineLevel(preferenceValue: number): InterventionLevel {
    const clamped = clampPreferenceValue(preferenceValue, 0.5);
    if (clamped >= INTERVENTION_THRESHOLDS.SILENT_MIN) {
      return 'SILENT';
    }
    if (clamped >= INTERVENTION_THRESHOLDS.SUGGESTION_MIN) {
      return 'SUGGESTION';
    }
    return 'IGNORE';
  }

  /**
   * カテゴリとユーザー嗜好プロファイルから、適用すべき介入レベルを取得する
   */
  public static getLevelForCategory(
    category: PainCategory,
    profile?: UserPreferenceProfile
  ): InterventionLevel {
    const rawValue = profile?.preferences?.[category];
    const value = clampPreferenceValue(rawValue, 0.5);
    return this.determineLevel(value);
  }

  /**
   * 学習用途・コード理解のための教育的ヒントメッセージを生成する
   */
  public static getEducationalHint(
    category: PainCategory,
    originalText: string,
    replacementText: string,
    presetMode: PresetMode = 'LEARNING'
  ): string {
    if (presetMode !== 'LEARNING') {
      return `💡 **Did you mean:** \`${replacementText}\`?`;
    }

    switch (category) {
      case 'SYNTAX_TYPO':
        return `🎓 **学習ヒント (タイポ):** \`${originalText}\` はキーワードの誤記の可能性があります。正しくは \`${replacementText}\` です。構文キーワードを正確に覚えることでエラーを予防できます。`;
      case 'INDENTATION_FORMATTING':
        return `🎓 **学習ヒント (コード構造):** インデントのズレは可読性を落とすだけでなく、Python等のインデント構文言語ではエラーの直接原因になります。一貫したインデントを意識しましょう。`;
      case 'VAR_FUNC_MANAGEMENT':
        return `🎓 **学習ヒント (命名・宣言):** 変数や関数は意図が伝わる命名規則（camelCase等）や適切なスコープ宣言を心がけましょう。`;
      case 'SYNTAX_ERROR_HANDLING':
        return `🎓 **学習ヒント (構文構造):** 括弧やブロックの対応関係に不整合があります。開いたブロックが正しく閉じられているか確認しましょう。`;
      default:
        return `🎓 **学習ヒント:** \`${replacementText}\` への修正が推奨されます。`;
    }
  }
}

/**
 * ユーザーの嗜好値と対象のエラー（PainCategory）に基づいて、システムの介入レベルを決定する純粋関数
 */
export function determineInterventionLevel(
  category: PainCategory,
  profile: UserPreferenceProfile
): InterventionLevel {
  return InterventionEngine.getLevelForCategory(category, profile);
}

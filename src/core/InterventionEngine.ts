import { InterventionLevel, PainCategory, UserPreferenceProfile } from '../types';

export class InterventionEngine {
  /**
   * ユーザー設定（1次元ベクトル）とエラー内容に基づき、介入レベルを動的に決定する
   * @param category 検出されたエラーのカテゴリ
   * @param profile ユーザーの嗜好値プロファイル (0.0: 介入不要 〜 1.0: 自動介入希望)
   * @returns 決定された介入レベル
   */
  public determineInterventionLevel(
    category: PainCategory,
    profile: UserPreferenceProfile
  ): InterventionLevel {
    const preferenceValue = profile.preferences[category];

    // デフォルトの閾値
    // 0.0 - 0.3: 介入不要 (IGNORE) - 楽しいので邪魔されたくない
    // 0.3 - 0.7: 提案 (SUGGESTION) - どちらでもない、提案程度に
    // 0.7 - 1.0: 自動修正 (SILENT) - わずらわしいので自動で直してほしい

    // preferenceValueが未定義の場合はデフォルトで SUGGESTION を返す
    if (preferenceValue === undefined) {
      return 'SUGGESTION';
    }

    if (preferenceValue <= 0.3) {
      return 'IGNORE';
    } else if (preferenceValue >= 0.7) {
      return 'SILENT';
    } else {
      return 'SUGGESTION';
    }
  }
}

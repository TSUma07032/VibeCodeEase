import { InterventionLevel, PainCategory, UserPreferenceProfile, clampPreferenceValue } from '../types';

/**
 * 介入レベルを判定する際の境界値
 */
export const THRESHOLDS = {
    // 嗜好値が 0.3 未満の場合、ユーザーにとって「とても楽しい・自力で解決したい」ため、システムは介入しない (IGNORE)
    IGNORE_MAX: 0.3,
    // 嗜好値が 0.3 以上 0.7 以下の場合は、ユーザーにとって「普通・提案があれば助かる」ため、提案を行う (SUGGESTION)
    // 嗜好値が 0.7 を超える場合、ユーザーにとって「とてもわずらわしい」ため、システムがサイレントに修正する (SILENT)
    SUGGESTION_MAX: 0.7,
};

/**
 * ユーザーの嗜好値と対象のエラー（PainCategory）に基づいて、システムの介入レベルを決定する純粋関数。
 *
 * @param category 発生したエラーの種類 (PainCategory)
 * @param profile ユーザーの嗜好値プロファイル (UserPreferenceProfile)
 * @returns 決定された介入レベル (InterventionLevel)
 */
export function determineInterventionLevel(category: PainCategory, profile: UserPreferenceProfile): InterventionLevel {
    // プロファイルから対象カテゴリの嗜好値を取得する。
    // カテゴリが未定義（または未知）の場合は、デフォルト値 0.5 （SUGGESTIONになる値）として扱う。
    const rawValue = profile?.preferences?.[category];
    const value = clampPreferenceValue(rawValue, 0.5);

    if (value < THRESHOLDS.IGNORE_MAX) {
        return 'IGNORE';
    } else if (value <= THRESHOLDS.SUGGESTION_MAX) {
        return 'SUGGESTION';
    } else {
        return 'SILENT';
    }
}

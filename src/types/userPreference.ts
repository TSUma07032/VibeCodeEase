import { PainCategory } from './painCategory';
import { InterventionLevel } from './interventionLevel';

/**
 * カテゴリごとの設定（介入レベルと閾値）
 */
export interface CategoryPreference {
  level: InterventionLevel;
  threshold?: number; // 例: 0〜100など
}

/**
 * 将来的に「楽しい/わずらわしいの1次元ベクトル（行列）」を表現するための設定用インターフェース
 */
export interface UserPreferenceProfile {
  preferences: Record<PainCategory, CategoryPreference>;
}

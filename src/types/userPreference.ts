import { PainCategory } from './painCategory';

/**
 * 各 PainCategory に対するユーザーの嗜好値
 * 0.0 (とても楽しいので介入不要) 〜 1.0 (とてもわずらわしいので自動介入希望)
 * 1次元ベクトルとして表現される
 */
export interface UserPreferenceProfile {
  preferences: Record<PainCategory, number>;
}

import { PainCategory } from './painCategory';
import { InterventionLevel } from './interventionLevel';
import { Range } from './common';

/**
 * 修正案の詳細
 */
export interface ProposedIntervention {
  originalText: string;
  replacementText: string;
  message?: string; // 提案理由のメッセージなど
}

/**
 * バックエンド（解析エンジン）がVS Code側のUI層に返すデータ構造
 */
export interface AnalysisResult {
  category: PainCategory;
  level: InterventionLevel;
  range: Range;
  interventions: ProposedIntervention[];
}

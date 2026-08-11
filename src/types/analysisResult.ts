import { PainCategory } from './painCategory';
import { InterventionLevel } from './interventionLevel';
import { Range } from './common';

/**
 * 修正案の詳細
 */
export interface ProposedIntervention {
  /** 修正対象の元のテキスト */
  originalText: string;
  /** 修正後のテキスト（推奨の修正案テキスト） */
  replacementText: string;
  /** 提案理由や解説などのメッセージ */
  message?: string;
}

/**
 * バックエンド（解析エンジン）がVS Code側のUI層に返すデータ構造
 */
export interface AnalysisResult {
  /** 検出された PainCategory */
  category: PainCategory;
  /** 適用すべき介入レベル (SILENT, SUGGESTION, IGNORE) */
  level: InterventionLevel;
  /** エラーが検出されたコード上の適用範囲 */
  range: Range;
  /** 推奨される修正案のリスト */
  interventions: ProposedIntervention[];
}

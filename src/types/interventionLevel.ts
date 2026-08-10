/**
 * システムがユーザーにどのように介入するか
 */
export type InterventionLevel =
  | 'SILENT'      // 裏で自動修正
  | 'SUGGESTION'  // ポップアップ等での提案
  | 'NONE';       // 介入しない・ユーザーの楽しさを優先

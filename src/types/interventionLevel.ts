/**
 * システムがユーザーにどのように介入するか（介入レベル）
 */
export type InterventionLevel =
  | 'SILENT'      // 裏で自動・サイレント修正
  | 'SUGGESTION'  // ポップアップやHover等での提案
  | 'IGNORE';     // 介入なし・スキップ（ユーザーの楽しさを優先）

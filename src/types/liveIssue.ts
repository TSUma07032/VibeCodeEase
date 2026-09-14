import { PainCategory } from './painCategory';

/**
 * サイドバーのルールカタログ表示用に、TypoRule を軽量シリアライズしたサマリ型
 */
export interface RuleSummary {
  /** 検出パターン（ユーザーが実際に打ちがちな誤記） */
  pattern: string;
  /** 修正後の正しいテキスト */
  replacement: string;
  /** 所属する PainCategory */
  category: PainCategory;
  /** 適用対象言語（未指定 = 全言語） */
  languageId?: string[];
}

/**
 * Webview の Grammarly パネル用: 現在ファイルの生きた問題1件
 */
export interface LiveIssue {
  /** 一意な識別子（却下時のフィルタリング等に使用） */
  id: string;
  /** 問題の行番号 (0-indexed) */
  line: number;
  /** 問題の列番号 (0-indexed) */
  character: number;
  /** 問題の終了行番号 (0-indexed) */
  endLine: number;
  /** 問題の終了列番号 (0-indexed) */
  endCharacter: number;
  /** 問題カテゴリ */
  category: PainCategory;
  /** 表示メッセージ */
  message: string;
  /** 修正候補テキスト（あれば） */
  replacementText?: string;
  /** 元のコード（ズレ補正用） */
  originalText?: string;
  /** 解析ソース */
  source: 'static' | 'ast' | 'llm';
}

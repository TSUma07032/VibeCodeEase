import * as vscode from 'vscode';
import { AnalysisResult, ProposedIntervention, PainCategory } from '../types';
import { AstAnalyzer } from './astAnalyzer';

export interface TypoRule {
  pattern: string;
  replacement: string;
  category: PainCategory;
  message?: string;
  /** 適用対象の言語ID（例: ['python']）。未指定の場合は言語不問で適用。 */
  languageId?: string[];
}

// ─────────────────────────────────────────────
// カテゴリA: キーワード誤記 (SYNTAX_TYPO)
// ─────────────────────────────────────────────
const KEYWORD_TYPO_RULES: TypoRule[] = [
  // --- 制御構文 ---
  { pattern: 'functon',    replacement: 'function',  category: 'SYNTAX_TYPO' },
  { pattern: 'retrun',     replacement: 'return',    category: 'SYNTAX_TYPO' },
  { pattern: 'reutrn',     replacement: 'return',    category: 'SYNTAX_TYPO' },
  { pattern: 'improt',     replacement: 'import',    category: 'SYNTAX_TYPO' },
  { pattern: 'imoprt',     replacement: 'import',    category: 'SYNTAX_TYPO' },
  { pattern: 'exprot',     replacement: 'export',    category: 'SYNTAX_TYPO' },
  { pattern: 'exoprt',     replacement: 'export',    category: 'SYNTAX_TYPO' },
  { pattern: 'defalt',     replacement: 'default',   category: 'SYNTAX_TYPO' },
  { pattern: 'clss ',      replacement: 'class ',    category: 'SYNTAX_TYPO' },
  { pattern: 'calss ',     replacement: 'class ',    category: 'SYNTAX_TYPO' },
  // --- 変数宣言 ---
  { pattern: 'conts ',     replacement: 'const ',    category: 'SYNTAX_TYPO' },
  { pattern: 'cosnt ',     replacement: 'const ',    category: 'SYNTAX_TYPO' },
  { pattern: 'lte ',       replacement: 'let ',      category: 'SYNTAX_TYPO' },
  { pattern: 'vra ',       replacement: 'var ',      category: 'SYNTAX_TYPO' },
  // --- 非同期 ---
  { pattern: 'asynch ',    replacement: 'async ',    category: 'SYNTAX_TYPO' },
  { pattern: 'awiat ',     replacement: 'await ',    category: 'SYNTAX_TYPO' },
  { pattern: 'yeild ',     replacement: 'yield ',    category: 'SYNTAX_TYPO' },
  // --- リテラル ---
  { pattern: 'ture',       replacement: 'true',      category: 'SYNTAX_TYPO' },
  { pattern: 'flase',      replacement: 'false',     category: 'SYNTAX_TYPO' },
  { pattern: 'nll',        replacement: 'null',      category: 'SYNTAX_TYPO' },
  { pattern: 'undefiend',  replacement: 'undefined', category: 'SYNTAX_TYPO' },
  { pattern: 'undefied',   replacement: 'undefined', category: 'SYNTAX_TYPO' },
  // --- 演算子・キーワード ---
  { pattern: 'tpyeof ',    replacement: 'typeof ',   category: 'SYNTAX_TYPO' },
  { pattern: 'intanceof ', replacement: 'instanceof ', category: 'SYNTAX_TYPO' },
  // --- よく使うオブジェクト ---
  { pattern: 'thsi.',      replacement: 'this.',     category: 'SYNTAX_TYPO' },
  { pattern: 'consoel.',   replacement: 'console.',  category: 'SYNTAX_TYPO' },
  { pattern: 'documnet.',  replacement: 'document.', category: 'SYNTAX_TYPO' },
  { pattern: 'widnow.',    replacement: 'window.',   category: 'SYNTAX_TYPO' },
  // --- Python 向け (Python 限定) ---
  { pattern: 'if condtion:', replacement: 'if condition:', category: 'SYNTAX_TYPO', languageId: ['python'] },
  { pattern: 'prnit(',     replacement: 'print(',   category: 'SYNTAX_TYPO', languageId: ['python'] },
  { pattern: 'pritn(',     replacement: 'print(',   category: 'SYNTAX_TYPO', languageId: ['python'] },
  { pattern: 'pritn ',     replacement: 'print ',   category: 'SYNTAX_TYPO', languageId: ['python'] },
  { pattern: 'dfe ',       replacement: 'def ',      category: 'SYNTAX_TYPO', languageId: ['python'] },
  { pattern: 'deef ',      replacement: 'def ',      category: 'SYNTAX_TYPO', languageId: ['python'] },
];

// ─────────────────────────────────────────────
// カテゴリB: 記号・演算子タイポ (SYNTAX_TYPO)
// ─────────────────────────────────────────────
const SYMBOL_TYPO_RULES: TypoRule[] = [
  // アロー関数のスペース混入
  {
    pattern: '= >',
    replacement: '=>',
    category: 'SYNTAX_TYPO',
    message: '$(lightbulb) **Did you mean:** `=>`? (アロー関数)'
  },
];

export const DEFAULT_TYPO_RULES: readonly TypoRule[] = [
  ...KEYWORD_TYPO_RULES,
  ...SYMBOL_TYPO_RULES,
];

interface CachedAnalysis {
  version: number;
  results: AnalysisResult[];
}

export class CodeAnalyzer {
  private readonly rules: readonly TypoRule[];

  constructor(rules: readonly TypoRule[] = DEFAULT_TYPO_RULES) {
    this.rules = rules;
  }

  /**
   * 入力されたコードテキストを解析し、タイポや構文エラーなどの問題を検出する
   * @param text 解析対象のコード文字列全体
   * @param languageId 解析対象のファイルの言語ID（例: 'python', 'typescript'）
   * @returns 検出された問題のリスト (AnalysisResult[])
   */
  public analyze(text: string, languageId?: string): AnalysisResult[] {
    const results: AnalysisResult[] = [];
    const lines = text.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];

      // カテゴリC: 末尾スペース検出
      const trailingMatch = lineText.match(/^(.*\S)( +)$/);
      if (trailingMatch) {
        const trailingStart = trailingMatch[1].length;
        results.push({
          category: 'INDENTATION_FORMATTING',
          level: 'SUGGESTION',
          range: {
            start: { line: lineIndex, character: trailingStart },
            end: { line: lineIndex, character: lineText.length }
          },
          interventions: [{
            originalText: lineText.slice(trailingStart),
            replacementText: '',
            message: '$(lightbulb) **末尾の余分なスペース**を削除できます。'
          }]
        });
      }

      // カテゴリA/B: ルールベースのタイポ検出
      for (const rule of this.rules) {
        // languageId フィルタ: ルールに言語指定がある場合は一致するときのみ検出
        if (rule.languageId && languageId && !rule.languageId.includes(languageId)) {
          continue;
        }

        let matchIndex = lineText.indexOf(rule.pattern);
        while (matchIndex !== -1) {
          const interventions: ProposedIntervention[] = [
            {
              originalText: rule.pattern,
              replacementText: rule.replacement,
              message: rule.message ?? `$(lightbulb) **Did you mean:** \`${rule.replacement}\`?`
            }
          ];

          results.push({
            category: rule.category,
            level: 'SUGGESTION',
            range: {
              start: { line: lineIndex, character: matchIndex },
              end: { line: lineIndex, character: matchIndex + rule.pattern.length }
            },
            interventions
          });
          matchIndex = lineText.indexOf(rule.pattern, matchIndex + rule.pattern.length);
        }
      }
    }

    // カテゴリC: 3行以上連続した空行を検出
    let emptyCount = 0;
    let emptyStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        if (emptyCount === 0) { emptyStart = i; }
        emptyCount++;
      } else {
        if (emptyCount >= 3) {
          // 3行以上連続空行: 先頭2行を残して以降を削除対象として提案
          for (let j = emptyStart + 2; j < emptyStart + emptyCount; j++) {
            results.push({
              category: 'INDENTATION_FORMATTING',
              level: 'SUGGESTION',
              range: {
                start: { line: j, character: 0 },
                end: { line: j, character: 0 }
              },
              interventions: [{
                originalText: '',
                replacementText: '',
                message: '$(lightbulb) **連続した空行**が多すぎます。2行以内にまとめると読みやすくなります。'
              }]
            });
          }
        }
        emptyCount = 0;
        emptyStart = -1;
      }
    }

    return results;
  }
}

export class SharedAnalysisCache {
  private static instance: SharedAnalysisCache;
  private analyzer: CodeAnalyzer;
  private astAnalyzer: AstAnalyzer;
  private cache: Map<string, CachedAnalysis>;
  /** LLM バックグラウンドサービスがマージした外部結果 (source: 'llm') */
  private externalResults: Map<string, AnalysisResult[]>;
  /** ユーザーが却下した問題のIDリスト */
  private ignoredIssues: Set<string>;

  private constructor() {
    this.analyzer = new CodeAnalyzer();
    this.astAnalyzer = new AstAnalyzer();
    this.cache = new Map<string, CachedAnalysis>();
    this.externalResults = new Map<string, AnalysisResult[]>();
    this.ignoredIssues = new Set<string>();
  }

  public static getInstance(): SharedAnalysisCache {
    if (!SharedAnalysisCache.instance) {
      SharedAnalysisCache.instance = new SharedAnalysisCache();
    }
    return SharedAnalysisCache.instance;
  }

  /**
   * アクティブなドキュメントの解析結果を返す。
   * 静的解析（ルールベース）・AST解析・LLM結果の3つをマージして返す。
   */
  public getResults(document: vscode.TextDocument): AnalysisResult[] {
    const uri = document.uri.toString();
    let cached = this.cache.get(uri);

    if (!cached || cached.version !== document.version) {
      const text = document.getText();
      const languageId = document.languageId;
      const fileName = document.fileName;

      // 静的解析 (ルールベース) → source: 'static'
      const staticResults = this.analyzer.analyze(text, languageId)
        .map(r => ({ ...r, source: 'static' as const }));

      // AST 解析 (TS/JS のみ) → source: 'ast'
      const astResults = this.astAnalyzer.analyze(text, fileName, languageId)
        .map(r => ({ ...r, source: 'ast' as const }));

      cached = {
        version: document.version,
        results: [...staticResults, ...astResults]
      };
      this.cache.set(uri, cached);
    }

    // LLM 結果をマージ（バージョン関係なく最新を使う）
    const external = this.externalResults.get(uri) ?? [];
    const allResults = [...cached.results, ...external];

    // 却下された問題をフィルタリング
    return allResults.filter(r => {
      const id = `${uri}::${r.source ?? 'static'}::${r.category}::${r.range.start.line}::${r.range.start.character}`;
      return !this.ignoredIssues.has(id);
    });
  }

  /**
   * LLM バックグラウンドサービスから呼ばれる。
   * 指定URIの外部解析結果（source: 'llm'）を上書き保存する。
   */
  public mergeExternalResults(uri: string, results: AnalysisResult[]): void {
    this.externalResults.set(uri, results.map(r => ({ ...r, source: 'llm' as const })));
  }

  /** 外部結果（LLM）のみをクリア */
  public clearExternalResults(uri: string): void {
    this.externalResults.delete(uri);
  }

  /** 特定の問題（LiveIssueのID相当）を無視リストに追加する */
  public ignoreIssue(id: string): void {
    this.ignoredIssues.add(id);
  }

  public clear() {
    this.cache.clear();
    this.externalResults.clear();
    this.ignoredIssues.clear();
  }
}

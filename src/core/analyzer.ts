import * as vscode from 'vscode';
import { AnalysisResult, ProposedIntervention, PainCategory } from '../types';

export interface TypoRule {
  pattern: string;
  replacement: string;
  category: PainCategory;
  message?: string;
}

export const DEFAULT_TYPO_RULES: readonly TypoRule[] = [
  {
    pattern: 'functon',
    replacement: 'function',
    category: 'SYNTAX_TYPO',
    message: '$(lightbulb) **Did you mean:** `function`?'
  },
  {
    pattern: 'if condtion:',
    replacement: 'if condition:',
    category: 'SYNTAX_TYPO',
    message: '$(lightbulb) **Did you mean:** `if condition:`?'
  }
] as const;

export class CodeAnalyzer {
  private readonly rules: readonly TypoRule[];

  constructor(rules: readonly TypoRule[] = DEFAULT_TYPO_RULES) {
    this.rules = rules;
  }

  /**
   * 入力されたコードテキストを解析し、タイポや構文エラーなどの問題を検出する
   * @param text 解析対象のコード文字列全体
   * @returns 検出された問題のリスト (AnalysisResult[])
   */
  public analyze(text: string): AnalysisResult[] {
    const results: AnalysisResult[] = [];
    const lines = text.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];

      for (const rule of this.rules) {
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

    return results;
  }
}

interface CachedAnalysis {
    version: number;
    results: AnalysisResult[];
}

export class SharedAnalysisCache {
    private static instance: SharedAnalysisCache;
    private analyzer: CodeAnalyzer;
    private cache: Map<string, CachedAnalysis>;

    private constructor() {
        this.analyzer = new CodeAnalyzer();
        this.cache = new Map<string, CachedAnalysis>();
    }

    public static getInstance(): SharedAnalysisCache {
        if (!SharedAnalysisCache.instance) {
            SharedAnalysisCache.instance = new SharedAnalysisCache();
        }
        return SharedAnalysisCache.instance;
    }

    public getResults(document: vscode.TextDocument): AnalysisResult[] {
        const uri = document.uri.toString();
        let cached = this.cache.get(uri);

        if (!cached || cached.version !== document.version) {
            const results = this.analyzer.analyze(document.getText());
            cached = {
                version: document.version,
                results: results
            };
            this.cache.set(uri, cached);
        }

        return cached.results;
    }

    public clear() {
        this.cache.clear();
    }
}

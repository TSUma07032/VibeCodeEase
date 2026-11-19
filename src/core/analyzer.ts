/**
 * [Why/Intent] ルールベース静的解析（タイポ・空白・連続空行検出）および
 * AST解析・LLMバックグラウンド解析結果を統合・重複排除・キャッシュ管理するモジュール。
 */
import * as vscode from 'vscode';
import type { AnalysisResult, PainCategory } from '../types';
import { AstAnalyzer } from './astAnalyzer';

/**
 * [Why/Intent] キーワードや記号のタイポ検出ルール定義インターフェース。
 */
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
    { pattern: 'functon', replacement: 'function', category: 'SYNTAX_TYPO' },
    { pattern: 'retrun', replacement: 'return', category: 'SYNTAX_TYPO' },
    { pattern: 'reutrn', replacement: 'return', category: 'SYNTAX_TYPO' },
    { pattern: 'improt', replacement: 'import', category: 'SYNTAX_TYPO' },
    { pattern: 'imoprt', replacement: 'import', category: 'SYNTAX_TYPO' },
    { pattern: 'exprot', replacement: 'export', category: 'SYNTAX_TYPO' },
    { pattern: 'exoprt', replacement: 'export', category: 'SYNTAX_TYPO' },
    { pattern: 'defalt', replacement: 'default', category: 'SYNTAX_TYPO' },
    { pattern: 'clss ', replacement: 'class ', category: 'SYNTAX_TYPO' },
    { pattern: 'calss ', replacement: 'class ', category: 'SYNTAX_TYPO' },
    // --- 変数宣言 ---
    { pattern: 'conts ', replacement: 'const ', category: 'SYNTAX_TYPO' },
    { pattern: 'cosnt ', replacement: 'const ', category: 'SYNTAX_TYPO' },
    { pattern: 'lte ', replacement: 'let ', category: 'SYNTAX_TYPO' },
    { pattern: 'vra ', replacement: 'var ', category: 'SYNTAX_TYPO' },
    // --- 非同期 ---
    { pattern: 'asynch ', replacement: 'async ', category: 'SYNTAX_TYPO' },
    { pattern: 'awiat ', replacement: 'await ', category: 'SYNTAX_TYPO' },
    { pattern: 'yeild ', replacement: 'yield ', category: 'SYNTAX_TYPO' },
    // --- リテラル ---
    { pattern: 'ture', replacement: 'true', category: 'SYNTAX_TYPO' },
    { pattern: 'flase', replacement: 'false', category: 'SYNTAX_TYPO' },
    { pattern: 'nll', replacement: 'null', category: 'SYNTAX_TYPO' },
    { pattern: 'undefiend', replacement: 'undefined', category: 'SYNTAX_TYPO' },
    { pattern: 'undefied', replacement: 'undefined', category: 'SYNTAX_TYPO' },
    // --- 演算子・キーワード ---
    { pattern: 'tpyeof ', replacement: 'typeof ', category: 'SYNTAX_TYPO' },
    { pattern: 'intanceof ', replacement: 'instanceof ', category: 'SYNTAX_TYPO' },
    // --- よく使うオブジェクト ---
    { pattern: 'thsi.', replacement: 'this.', category: 'SYNTAX_TYPO' },
    { pattern: 'consoel.', replacement: 'console.', category: 'SYNTAX_TYPO' },
    { pattern: 'documnet.', replacement: 'document.', category: 'SYNTAX_TYPO' },
    { pattern: 'widnow.', replacement: 'window.', category: 'SYNTAX_TYPO' },
    // --- Python 向け (Python 限定) ---
    {
        pattern: 'if condtion:',
        replacement: 'if condition:',
        category: 'SYNTAX_TYPO',
        languageId: ['python'],
    },
    { pattern: 'prnit(', replacement: 'print(', category: 'SYNTAX_TYPO', languageId: ['python'] },
    { pattern: 'pritn(', replacement: 'print(', category: 'SYNTAX_TYPO', languageId: ['python'] },
    { pattern: 'pritn ', replacement: 'print ', category: 'SYNTAX_TYPO', languageId: ['python'] },
    { pattern: 'dfe ', replacement: 'def ', category: 'SYNTAX_TYPO', languageId: ['python'] },
    { pattern: 'deef ', replacement: 'def ', category: 'SYNTAX_TYPO', languageId: ['python'] },
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
        message: 'アロー関数のスペース混入を修正\n`=>` の間にスペースが入っています。',
    },
];

/**
 * [Why/Intent] デフォルトのタイポ検出ルールセット。
 */
export const DEFAULT_TYPO_RULES: readonly TypoRule[] = [
    ...KEYWORD_TYPO_RULES,
    ...SYMBOL_TYPO_RULES,
];

interface CachedAnalysis {
    version: number;
    results: AnalysisResult[];
}

/**
 * [Why/Intent] テキストベースのタイポ・行末スペース・連続空行を高速検出する静的アナライザクラス。
 */
export class CodeAnalyzer {
    private readonly rules: readonly TypoRule[];

    public constructor(rules: readonly TypoRule[] = DEFAULT_TYPO_RULES) {
        this.rules = rules;
    }

    /**
     * [Why/Intent] 入力されたコードテキストを解析し、タイポや構文エラーなどの問題を検出する。
     * @param text 解析対象のコード文字列全体
     * @param languageId 解析対象のファイルの言語ID（例: 'python', 'typescript'）
     * @returns 検出された問題のリスト (AnalysisResult[])
     */
    public analyze(text: string, languageId?: string): AnalysisResult[] {
        const results: AnalysisResult[] = [];
        const lines = text.split(/\r?\n/);

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex];
            const trailing = this.checkTrailingSpaces(lineText, lineIndex);
            if (trailing) {
                results.push(trailing);
            }
            results.push(...this.checkRuleMatches(lineText, lineIndex, languageId));
        }

        results.push(...this.checkConsecutiveEmptyLines(lines));
        return results;
    }

    private checkTrailingSpaces(lineText: string, lineIndex: number): AnalysisResult | null {
        const trailingMatch = lineText.match(/^(.*\S)( +)$/);
        if (!trailingMatch) {
            return null;
        }
        const trailingStart = trailingMatch[1].length;
        return {
            category: 'INDENTATION_FORMATTING',
            level: 'SUGGESTION',
            range: {
                start: { line: lineIndex, character: trailingStart },
                end: { line: lineIndex, character: lineText.length },
            },
            interventions: [
                {
                    originalText: lineText.slice(trailingStart),
                    replacementText: '',
                    message:
                        '行末の余分なスペースを削除\n末尾の不要な空白文字を削除して整形できます。',
                },
            ],
        };
    }

    private isWordBoundaryMatch(lineText: string, matchIndex: number, pattern: string): boolean {
        const prevChar = matchIndex > 0 ? lineText[matchIndex - 1] : '';
        const afterIndex = matchIndex + pattern.length;
        const nextChar = afterIndex < lineText.length ? lineText[afterIndex] : '';
        const validStart = !/^[a-zA-Z_]/.test(pattern) || !/[a-zA-Z0-9_$]/.test(prevChar);
        const validEnd = !/[a-zA-Z_]$/.test(pattern) || !/[a-zA-Z0-9_$]/.test(nextChar);
        return validStart && validEnd;
    }

    private checkRuleMatches(
        lineText: string,
        lineIndex: number,
        languageId?: string,
    ): AnalysisResult[] {
        const results: AnalysisResult[] = [];
        for (const rule of this.rules) {
            if (rule.languageId && languageId && !rule.languageId.includes(languageId)) {
                continue;
            }

            let matchIndex = lineText.indexOf(rule.pattern);
            while (matchIndex !== -1) {
                const afterIndex = matchIndex + rule.pattern.length;
                if (this.isWordBoundaryMatch(lineText, matchIndex, rule.pattern)) {
                    const cleanOriginal = rule.pattern.trim();
                    const cleanReplacement = rule.replacement.trim();
                    results.push({
                        category: rule.category,
                        level: 'SUGGESTION',
                        range: {
                            start: { line: lineIndex, character: matchIndex },
                            end: { line: lineIndex, character: afterIndex },
                        },
                        interventions: [
                            {
                                originalText: rule.pattern,
                                replacementText: rule.replacement,
                                message:
                                    rule.message ??
                                    `タイポ修正: ${cleanOriginal} → ${cleanReplacement}\nキーワードの綴り誤りの可能性があります。\`${cleanReplacement}\` への修正を検討してください。`,
                            },
                        ],
                    });
                    matchIndex = lineText.indexOf(rule.pattern, afterIndex);
                } else {
                    matchIndex = lineText.indexOf(rule.pattern, matchIndex + 1);
                }
            }
        }
        return results;
    }

    private checkConsecutiveEmptyLines(lines: string[]): AnalysisResult[] {
        const results: AnalysisResult[] = [];
        let emptyCount = 0;
        let emptyStart = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '') {
                if (emptyCount === 0) {
                    emptyStart = i;
                }
                emptyCount++;
                continue;
            }

            if (emptyCount >= 3) {
                this.addEmptyLineResults(results, emptyStart, emptyCount);
            }
            emptyCount = 0;
            emptyStart = -1;
        }

        if (emptyCount >= 3) {
            this.addEmptyLineResults(results, emptyStart, emptyCount);
        }
        return results;
    }

    /**
     * [Why/Intent] 3行以上の連続空行ブロックに対し、行ごとに重複した提案を出さず1つの範囲として集約提案する。
     */
    private addEmptyLineResults(
        results: AnalysisResult[],
        emptyStart: number,
        emptyCount: number,
    ): void {
        results.push({
            category: 'INDENTATION_FORMATTING',
            level: 'SUGGESTION',
            range: {
                start: { line: emptyStart + 2, character: 0 },
                end: { line: emptyStart + emptyCount - 1, character: 0 },
            },
            interventions: [
                {
                    originalText: '',
                    replacementText: '',
                    message:
                        '連続した空行を2行以内に整理\n連続した空行が多すぎます。2行以内にまとめると読みやすくなります。',
                },
            ],
        });
    }
}

/**
 * [Why/Intent] 静的解析・AST解析・LLM解析結果を統合し、同一・重複箇所の排除と却下済みIDのフィルタリングを行う共有キャッシュクラス。
 */
export class SharedAnalysisCache {
    private static instance: SharedAnalysisCache;
    private analyzer: CodeAnalyzer;
    private astAnalyzer: AstAnalyzer;
    private cache: Map<string, CachedAnalysis>;
    /** LLM バックグラウンドサービスがマージした外部結果 (source: 'llm') */
    private externalResults: Map<string, AnalysisResult[]>;
    /** ユーザーが却下した問題のIDリスト */
    private ignoredIssues: Set<string>;

    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    private constructor() {
        this.analyzer = new CodeAnalyzer();
        this.astAnalyzer = new AstAnalyzer();
        this.cache = new Map<string, CachedAnalysis>();
        this.externalResults = new Map<string, AnalysisResult[]>();
        this.ignoredIssues = new Set<string>();
    }

    /**
     * [Why/Intent] SharedAnalysisCacheのシングルトンインスタンスを取得する。
     */
    public static getInstance(): SharedAnalysisCache {
        if (!SharedAnalysisCache.instance) {
            SharedAnalysisCache.instance = new SharedAnalysisCache();
        }
        return SharedAnalysisCache.instance;
    }

    /**
     * [Why/Intent] アクティブなドキュメントの解析結果を返す。
     * 静的解析（ルールベース）・AST解析・LLM結果の3つをマージし、
     * 同一行・重複行への多重推薦を優先度順（LLM > AST > Static）で排除して返す。
     */
    public getResults(document: vscode.TextDocument): AnalysisResult[] {
        const uri = document.uri.toString();
        let cached = this.cache.get(uri);

        if (cached?.version !== document.version) {
            const text = document.getText();
            const languageId = document.languageId;
            const fileName = document.fileName;

            const staticResults = this.analyzer
                .analyze(text, languageId)
                .map((r) => ({ ...r, source: 'static' as const }));

            const astResults = this.astAnalyzer
                .analyze(text, fileName, languageId)
                .map((r) => ({ ...r, source: 'ast' as const }));

            cached = {
                version: document.version,
                results: [...astResults, ...staticResults],
            };
            this.cache.set(uri, cached);
        }

        const external = this.externalResults.get(uri) ?? [];
        return this.deduplicateAndFilterResults(uri, [...external, ...cached.results]);
    }

    private deduplicateAndFilterResults(
        uri: string,
        prioritized: AnalysisResult[],
    ): AnalysisResult[] {
        const filtered: AnalysisResult[] = [];
        for (const r of prioritized) {
            const id = `${uri}::${r.source ?? 'static'}::${r.category}::${r.range.start.line}::${r.range.start.character}`;
            if (this.ignoredIssues.has(id)) {
                continue;
            }
            const hasLineOverlap = filtered.some(
                (accepted) =>
                    accepted.range.start.line <= r.range.end.line &&
                    accepted.range.end.line >= r.range.start.line,
            );
            if (!hasLineOverlap) {
                filtered.push(r);
            }
        }

        return filtered.sort(
            (a, b) =>
                a.range.start.line - b.range.start.line ||
                a.range.start.character - b.range.start.character,
        );
    }

    /**
     * [Why/Intent] LLM バックグラウンドサービスから呼ばれ、指定URIの外部解析結果（source: 'llm'）を上書き保存する。
     */
    public mergeExternalResults(uri: string, results: AnalysisResult[]): void {
        this.externalResults.set(
            uri,
            results.map((r) => ({ ...r, source: 'llm' as const })),
        );
        this._onDidChange.fire();
    }

    /**
     * [Why/Intent] 外部LLM結果が登録されている全ドキュメントURIの一覧を返す。
     */
    public getAllExternalUris(): string[] {
        return Array.from(this.externalResults.keys());
    }

    /**
     * [Why/Intent] 指定URIの外部結果（LLM）のみをクリアする。
     */
    public clearExternalResults(uri: string): void {
        this.externalResults.delete(uri);
        this._onDidChange.fire();
    }

    /**
     * [Why/Intent] 特定の問題（LiveIssueのID相当）を無視リストに追加する。
     */
    public ignoreIssue(id: string): void {
        this.ignoredIssues.add(id);
        this._onDidChange.fire();
    }

    public unignoreIssue(id: string): void {
        this.ignoredIssues.delete(id);
        this._onDidChange.fire();
    }

    /**
     * [Why/Intent] キャッシュ・外部結果・無視リストをすべて初期化する。
     */
    public clear(): void {
        this.cache.clear();
        this.externalResults.clear();
        this.ignoredIssues.clear();
    }
}

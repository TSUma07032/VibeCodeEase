/**
 * [Why/Intent] 拡張機能内の通信機能追加を厳格に監視するアーキテクチャ境界テスト。
 * src/core/llm/ 以外のプロダクションコードにおいて、野良の直接HTTP通信や低レベルクライアントの生成を
 * 静的走査によって機械的に検知し、将来の開発で通信境界が破壊されるのを100%遮断する。
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * [Why/Intent] 走査対象となる境界違反パターンの型定義
 */
interface BoundaryPattern {
    /** [Why/Intent] 検出用の正規表現 */
    regex: RegExp;
    /** [Why/Intent] 人間可読な違反内容の説明 */
    description: string;
}

/**
 * [Why/Intent] 禁止された野良通信および低レベルクライアント直接呼び出しパターン一覧。
 * require, import, fetch, axios, 直接インスタンス化, vscode.lm を完全網羅する。
 */
export const FORBIDDEN_PATTERNS: BoundaryPattern[] = [
    {
        regex: /(?:from|require\s*\()\s*['"](?:node:)?https['"]/i,
        description: "直接の 'https' モジュールインポート/require",
    },
    {
        regex: /(?:from|require\s*\()\s*['"](?:node:)?http['"]/i,
        description: "直接の 'http' モジュールインポート/require",
    },
    {
        regex: /import\s*\(\s*['"](?:node:)?https?['"]\s*\)/i,
        description: "動的 import('https') の呼び出し",
    },
    {
        regex: /\bfetch\s*\(/i,
        description: '直接の fetch() 呼び出し',
    },
    {
        regex: /\baxios\b/i,
        description: 'axios ライブラリの直接使用',
    },
    {
        regex: /new\s+GeminiClient\s*\(/i,
        description: '直接の new GeminiClient() インスタンス化 (ILlmGateway を使用してください)',
    },
    {
        regex: /new\s+VscodeLmClient\s*\(/i,
        description: '直接の new VscodeLmClient() インスタンス化 (ILlmGateway を使用してください)',
    },
    {
        regex: /vscode\.lm\.selectChatModels/i,
        description: '直接の vscode.lm.selectChatModels 呼び出し (ILlmGateway を使用してください)',
    },
];

/**
 * [Why/Intent] 静的解析で検出された境界違反情報
 */
export interface Violation {
    /** [Why/Intent] 違反が検出されたファイルパス */
    file: string;
    /** [Why/Intent] 違反した境界ルール名 */
    rule: string;
    /** [Why/Intent] 検出行番号 */
    line: number;
}

/**
 * [Why/Intent] 指定ディレクトリ配下の全プロダクションTypeScriptファイルを再帰的に取得する
 */
export function getProductionTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'test' && entry.name !== 'node_modules' && entry.name !== 'out') {
                getProductionTypeScriptFiles(fullPath, fileList);
            }
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

/**
 * [Why/Intent] ソースコードからコメント（単一行および複数行ブロック）を除去した安全な文字列を生成する
 */
export function stripComments(code: string): string {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length))
        .replace(/\/\/.*$/gm, (match) => ' '.repeat(match.length));
}

/**
 * [Why/Intent] 単一ファイルのソースコード全体を走査し、コメントを除去した上で禁止パターン違反を検出する
 */
export function scanSourceForViolations(content: string, filePath: string): Violation[] {
    const stripped = stripComments(content);
    const lines = stripped.split('\n');
    const violations: Violation[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.regex.test(line)) {
                violations.push({
                    file: filePath,
                    rule: pattern.description,
                    line: i + 1,
                });
            }
        }
    }
    return violations;
}

suite('LLM Architecture Boundary Test Suite', () => {
    /**
     * [Why/Intent] 境界テスト検出器自体の検知力（ネガティブテスト）を検証し、正規表現の抜け穴を防止する
     */
    test('境界テストの検知器が禁止パターン（fetch, require, new GeminiClient等）を漏れなく捕捉すること', () => {
        const pseudoBadCode = `
            import * as https from 'node:https';
            const oldHttps = require('https');
            const data = await fetch('https://api.google.com');
            const axiosClient = axios.create();
            const client = new GeminiClient();
            const lm = new VscodeLmClient();
            const models = await vscode.lm.selectChatModels();
            // コメント内の fetch('http') は無視されること
        `;

        const violations = scanSourceForViolations(pseudoBadCode, 'dummy.ts');
        assert.ok(
            violations.length >= 7,
            `7件以上の違反が検出されるべきですが、${violations.length}件でした`,
        );
        assert.ok(violations.some((v) => v.rule.includes("'https' モジュール")));
        assert.ok(violations.some((v) => v.rule.includes('fetch()')));
        assert.ok(violations.some((v) => v.rule.includes('axios')));
        assert.ok(violations.some((v) => v.rule.includes('new GeminiClient()')));
        assert.ok(violations.some((v) => v.rule.includes('new VscodeLmClient()')));
        assert.ok(violations.some((v) => v.rule.includes('vscode.lm.selectChatModels')));
    });

    /**
     * [Why/Intent] src/core/llm/ 以外のプロダクションコードで野良通信・直接クライアント生成が行われていないことを検証する
     */
    test('src/core/llm/ 以外のプロダクションコードで直接HTTP通信や低レベルクライアント生成を行っていないこと', () => {
        const srcDir = path.resolve(__dirname, '../../src');
        const productionFiles = getProductionTypeScriptFiles(srcDir);
        const violations: Violation[] = [];

        for (const filePath of productionFiles) {
            const relativePath = path.relative(srcDir, filePath).replace(/\\/g, '/');
            // src/core/llm/ 配下のクライアント実装自身は低レベル通信を担当するため除外
            if (relativePath.startsWith('core/llm/')) {
                continue;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            const fileViolations = scanSourceForViolations(content, relativePath);
            violations.push(...fileViolations);
        }

        const violationMessages = violations.map(
            (v) => `[境界違反] ${v.file}:${v.line} - ${v.rule}`,
        );

        assert.deepStrictEqual(
            violationMessages,
            [],
            `LLM通信境界違反が検出されました。通信は必ず ILlmGateway を経由してください:\n${violationMessages.join('\n')}`,
        );
    });
});

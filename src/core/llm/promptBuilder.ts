/**
 * [Why/Intent] コードレビューおよびAI介入生成用のプロンプト構築およびJSONスキーマ定義。
 * 機密ファイルの送信防止ガード（assertNotSensitiveDocument）を一元的に適用する。
 */
import type * as vscode from 'vscode';
import { PAIN_CATEGORIES } from '../../types';
import type { PresetMode } from '../../types/preset';
import { assertNotSensitiveDocument } from '../utils/sensitiveDocumentGuard';

/**
 * [Why/Intent] Gemini API 等に渡す構造化介入出力の JSON Schema 定義
 */
export const INTERVENTION_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    required: ['summary', 'edits'],
    properties: {
        summary: { type: 'string' },
        edits: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                required: [
                    'startLine',
                    'startCharacter',
                    'endLine',
                    'endCharacter',
                    'oldText',
                    'newText',
                    'category',
                    'reason',
                ],
                properties: {
                    startLine: { type: 'INTEGER', minimum: 0 },
                    startCharacter: { type: 'INTEGER', minimum: 0 },
                    endLine: { type: 'INTEGER', minimum: 0 },
                    endCharacter: { type: 'INTEGER', minimum: 0 },
                    oldText: { type: 'STRING' },
                    newText: { type: 'STRING' },
                    category: { type: 'STRING', enum: PAIN_CATEGORIES },
                    reason: { type: 'STRING' },
                },
            },
        },
    },
};

/**
 * [Why/Intent] プリセットモードに応じたレビュー指示文を解決するヘルパー（複雑度抑制）
 */
function resolveModeInstruction(presetMode?: PresetMode): string {
    if (presetMode === 'HINT') {
        return 'Analyze the file below and avoid writing the exact solution code. Instead, insert comments or hint texts suggesting how the user can fix/improve the code. Do not write the final implementation.';
    }
    if (presetMode === 'ARCHITECTURE') {
        return 'Analyze the file below and heavily focus on refactoring for better architecture, separation of concerns, scalability, and design patterns. Propose robust architectural improvements.';
    }
    if (presetMode === 'BUG_TYPO') {
        return 'Analyze the file below and strictly focus on fixing typos, null exceptions, vulnerabilities, and simple bugs. Leave the overall logic and architecture completely untouched.';
    }
    return 'Analyze the file below and propose ALL concrete, minimal edits that improve correctness, readability, or remove obvious friction. Please propose MULTIPLE edits across the file if applicable.';
}

/**
 * [Why/Intent] コードレビュー・介入生成用のプロンプト文字列を構築する。
 * 機密ファイルは共通ガード（assertNotSensitiveDocument）により確実に弾く。
 */
export function buildInterventionPrompt(
    document: vscode.TextDocument,
    preferenceSummary?: string,
    presetMode?: PresetMode,
): string {
    // 共通機密ファイルガードを適用
    assertNotSensitiveDocument(document);

    const rawCode = document.getText();
    const sanitizedCode = rawCode.replace(/```/g, '\\`\\`\\`');
    const modeInstruction = resolveModeInstruction(presetMode);

    return [
        'You are a code review assistant.',
        modeInstruction,
        'All line and character positions must be zero-based and must point inside the supplied file. Use the exact line text and never invent a position beyond the line length.',
        'For every edit, oldText must be copied exactly from the target text. It may span multiple lines. The extension will locate oldText in the real file before applying it.',
        preferenceSummary
            ? 'Apply the following user preferences for your explanation style:\n' +
              preferenceSummary
            : '',
        'For the `reason` field, explain the intervention in Japanese, assuming the reader is a university student who has studied Computer Science. Provide a polite and technically sound explanation. You may use markdown like backticks for code.',
        'Return JSON only. Do not wrap it in markdown fences.',
        `JSON schema: ${JSON.stringify(INTERVENTION_RESPONSE_SCHEMA)}`,
        `File: ${document.fileName}`,
        `Language: ${document.languageId}`,
        'Content:',
        '```',
        sanitizedCode,
        '```',
    ].join('\n');
}

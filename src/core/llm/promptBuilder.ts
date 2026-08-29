import * as vscode from 'vscode';
import { PAIN_CATEGORIES } from '../../types';

export const INTERVENTION_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    required: ['summary', 'edits'],
    properties: {
        summary: { type: 'string' },
        edits: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                required: ['startLine', 'startCharacter', 'endLine', 'endCharacter', 'oldText', 'newText', 'category', 'reason'],
                properties: {
                    startLine: { type: 'INTEGER', minimum: 0 },
                    startCharacter: { type: 'INTEGER', minimum: 0 },
                    endLine: { type: 'INTEGER', minimum: 0 },
                    endCharacter: { type: 'INTEGER', minimum: 0 },
                    oldText: { type: 'STRING' },
                    newText: { type: 'STRING' },
                    category: { type: 'STRING', enum: PAIN_CATEGORIES },
                    reason: { type: 'STRING' }
                }
            }
        }
    }
};

/**
 * コードレビュー・介入生成用のプロンプト文字列を構築する
 */
export function buildInterventionPrompt(document: vscode.TextDocument): string {
    return [
        'You are a code review assistant.',
        'Analyze the file below and propose only concrete, minimal edits that improve correctness or remove obvious friction.',
        'All line and character positions must be zero-based and must point inside the supplied file. Use the exact line text and never invent a position beyond the line length.',
        'For every edit, oldText must be copied exactly from the target text. It may span multiple lines. The extension will locate oldText in the real file before applying it.',
        'Return JSON only. Do not wrap it in markdown fences.',
        `JSON schema: ${JSON.stringify(INTERVENTION_RESPONSE_SCHEMA)}`,
        `File: ${document.fileName}`,
        `Language: ${document.languageId}`,
        'Content:',
        document.getText()
    ].join('\n');
}

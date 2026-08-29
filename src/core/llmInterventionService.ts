import * as vscode from 'vscode';
import * as https from 'https';
import { URL } from 'url';
import { LlmEdit, LlmInterventionPlan, PAIN_CATEGORIES } from '../types';

const responseSchema = {
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

interface GeminiModel {
    name: string;
    supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
    models?: GeminiModel[];
}

export class LlmInterventionService {
    public async createGeminiPlan(document: vscode.TextDocument, token: vscode.CancellationToken, apiKey: string): Promise<LlmInterventionPlan> {
        const prompt = this.createPrompt(document);

            const modelsResponse = await this.request(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
                undefined,
                token
            );
            if (modelsResponse.statusCode < 200 || modelsResponse.statusCode >= 300) {
                throw new Error(`Geminiのモデル一覧取得に失敗しました（HTTP ${modelsResponse.statusCode}）。APIキーとGenerative Language APIの有効化を確認してください。`);
            }

            const models = (JSON.parse(modelsResponse.body) as GeminiModelsResponse).models ?? [];
            const preferredNames = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
            const availableModels = models.filter((model) => model.supportedGenerationMethods?.includes('generateContent'));
            const preferredModels = preferredNames
                .map((preferredName) => availableModels.find((model) => model.name.endsWith(`/${preferredName}`)))
                .filter((model): model is GeminiModel => model !== undefined);
            const candidateModels = [...preferredModels, ...availableModels.filter((model) => !preferredModels.includes(model))];

            if (candidateModels.length === 0) {
                throw new Error('Gemini APIでgenerateContentに対応するモデルが見つかりません。');
            }

            for (const model of candidateModels) {
                const response = await this.request(
                    `https://generativelanguage.googleapis.com/v1beta/${model.name}:generateContent?key=${encodeURIComponent(apiKey)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    },
                    token,
                    JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            responseSchema
                        }
                    })
                );
                if (response.statusCode === 404) {
                    continue;
                }
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    const details = response.body.slice(0, 160);
                    throw new Error(`Gemini APIリクエストに失敗しました（HTTP ${response.statusCode}）。${details}`);
                }

                const data = JSON.parse(response.body) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
                const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!raw) {
                    throw new Error('Geminiから介入プランが返されませんでした。');
                }
                return this.validatePlan(JSON.parse(raw), document);
            }

            throw new Error('利用可能なGeminiモデルが見つかりません。APIキーが新規ユーザー向けモデルを利用できるか確認してください。');
    }

    public async createPlan(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<LlmInterventionPlan> {
        // Providerやモデル名を固定せず、現在のVS Code環境で利用可能なモデルを選ぶ。
        const models = await vscode.lm.selectChatModels();
        if (models.length === 0) {
            throw new Error('利用可能なVS Code Language Modelが見つかりません。GitHub Copilot等のLanguage Modelプロバイダーにログインし、Extension Development Host側で有効にしてください。');
        }

        const prompt = this.createPrompt(document);
        const response = await models[0].sendRequest(
            [vscode.LanguageModelChatMessage.User(prompt)],
            {},
            token
        );
        let raw = '';
        for await (const fragment of response.text) {
            raw += fragment;
        }

        const jsonText = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        return this.validatePlan(JSON.parse(jsonText), document);
    }

    private createPrompt(document: vscode.TextDocument): string {
        const sensitivePatterns = [/\.env/i, /\.git/i, /secrets/i, /credentials/i];
        if (sensitivePatterns.some(pattern => pattern.test(document.fileName))) {
            const fileNameOnly = document.uri.path.split('/').pop();
            throw new Error(`セキュリティエラー: 機密ファイル(${fileNameOnly})へのアクセスは禁止されています。`);
        }

        const rawCode = document.getText();
        const sanitizedCode = rawCode.replace(/```/g, '\\`\\`\\`');

        return [
            'You are a code review assistant.',
            'Analyze the file below and propose only concrete, minimal edits that improve correctness or remove obvious friction.',
            'All line and character positions must be zero-based and must point inside the supplied file. Use the exact line text and never invent a position beyond the line length.',
            'For every edit, oldText must be copied exactly from the target text. It may span multiple lines. The extension will locate oldText in the real file before applying it.',
            'Return JSON only. Do not wrap it in markdown fences.',
            `JSON schema: ${JSON.stringify(responseSchema)}`,
            `File: ${document.fileName}`,
            `Language: ${document.languageId}`,
            'Content:',
            '```',
            sanitizedCode,
            '```'
        ].join('\n');
    }

    private request(urlString: string, options: https.RequestOptions = {}, token: vscode.CancellationToken, body?: string): Promise<{ statusCode: number; body: string }> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlString);
            const request = https.request(url, { ...options, method: options.method ?? 'GET' }, (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => body += chunk);
                response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body }));
            });
            const cancellation = token.onCancellationRequested(() => request.destroy(new Error('リクエストがキャンセルされました。')));
            request.on('close', () => cancellation.dispose());
            request.on('error', reject);
            if (body) {
                request.write(body);
            }
            request.end();
        });
    }

    private validatePlan(value: unknown, document: vscode.TextDocument): LlmInterventionPlan {
        if (!value || typeof value !== 'object') {
            throw new Error('LLMの介入プラン形式が不正です。');
        }

        const candidate = value as { summary?: unknown; edits?: unknown };
        if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.edits)) {
            throw new Error('LLMの介入プランに必要な項目がありません。');
        }

        const edits = candidate.edits.map((edit): LlmEdit => {
            if (!edit || typeof edit !== 'object') {
                throw new Error('LLMの変更案形式が不正です。');
            }
            const item = edit as Record<string, unknown>;
            const positions = ['startLine', 'startCharacter', 'endLine', 'endCharacter'];
            if (!positions.every((key) => Number.isInteger(item[key]) && (item[key] as number) >= 0) ||
                typeof item.newText !== 'string' || typeof item.category !== 'string' ||
                !PAIN_CATEGORIES.includes(item.category as LlmEdit['category']) || typeof item.reason !== 'string') {
                throw new Error('LLMの変更案に不正な値があります。');
            }

            const startLine = item.startLine as number;
            const endLine = item.endLine as number;
            const startCharacter = item.startCharacter as number;
            const endCharacter = item.endCharacter as number;
            if (typeof item.oldText !== 'string' || !item.oldText) {
                throw new Error('LLMの変更案にoldTextがありません。');
            }
            if (startLine >= document.lineCount || endLine >= document.lineCount) {
                throw new Error(`LLMの変更範囲がファイル外を指しています。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}、ファイル: ${document.lineCount}行です。`);
            }
            const documentText = document.getText();
            const normalizedDocumentText = documentText.replace(/\r\n/g, '\n');
            const normalizedOldText = (item.oldText as string).replace(/\r\n/g, '\n');
            const matches: number[] = [];
            let searchFrom = 0;
            while (true) {
                const match = normalizedDocumentText.indexOf(normalizedOldText, searchFrom);
                if (match < 0) {
                    break;
                }
                matches.push(match);
                searchFrom = match + item.oldText.length;
            }
            if (matches.length === 0) {
                throw new Error(`LLMが指定したoldTextをファイル内で見つけられません。要求範囲: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`);
            }
            const hintLine = Math.min(startLine, document.lineCount - 1);
            const hintCharacter = Math.min(startCharacter, document.lineAt(hintLine).text.length);
            const hintOffset = document.offsetAt(new vscode.Position(hintLine, hintCharacter));
            const matchOffsetNormalized = matches.reduce((closest, current) =>
                Math.abs(current - hintOffset) < Math.abs(closest - hintOffset) ? current : closest
            );
            const matchOffset = this.toOriginalOffset(documentText, matchOffsetNormalized);
            const endOffset = this.toOriginalOffset(documentText, matchOffsetNormalized + normalizedOldText.length);
            const resolvedRange = new vscode.Range(
                document.positionAt(matchOffset),
                document.positionAt(endOffset)
            );

            return {
                startLine: resolvedRange.start.line,
                startCharacter: resolvedRange.start.character,
                endLine: resolvedRange.end.line,
                endCharacter: resolvedRange.end.character,
                oldText: item.oldText as string,
                newText: item.newText as string,
                category: item.category as LlmEdit['category'],
                reason: item.reason as string
            };
        });

        return { summary: candidate.summary, edits };
    }

    private toOriginalOffset(text: string, normalizedOffset: number): number {
        let normalizedIndex = 0;
        for (let originalIndex = 0; originalIndex < text.length; originalIndex++) {
            if (normalizedIndex === normalizedOffset) {
                return originalIndex;
            }
            if (text[originalIndex] === '\r' && text[originalIndex + 1] === '\n') {
                originalIndex++;
            }
            normalizedIndex++;
        }
        return text.length;
    }
}
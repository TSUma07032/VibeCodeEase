/**
 * [Why/Intent] VS Code Language Model APIを経由したLLM通信・モデル選択・JSON抽出およびエラーマッピングを担当するクライアントモジュール。
 */
import * as vscode from 'vscode';
import { LlmError, mapVsCodeLmErrorToLlmError } from './llmErrors';
import type { RawLlmResponse } from './llmGateway';

/**
 * [Why/Intent] VS Code Language Model APIとの直接通信をカプセル化する低レベルクライアント。
 * 利用可能なLanguageModelChatの選択、ストリーミング受信、JSONパースおよびRawLlmResponseの構築を行う。
 */
export class VscodeLmClient {
    /**
     * [Why/Intent] VS Code Language Model APIを用いてモデルを選択・リクエストを送信し、未加工の生テキストとパース済みオブジェクトを返す
     */
    public async generateWithRaw<T>(
        prompt: string,
        token: vscode.CancellationToken,
        modelSelector?: string,
    ): Promise<RawLlmResponse<T>> {
        let models: vscode.LanguageModelChat[];
        try {
            models = await vscode.lm.selectChatModels();
        } catch (e) {
            throw mapVsCodeLmErrorToLlmError(e);
        }

        if (modelSelector && modelSelector !== 'auto') {
            const matched = models.filter(
                (m) =>
                    m.family.includes(modelSelector) ||
                    m.id.includes(modelSelector) ||
                    m.name.includes(modelSelector),
            );
            if (matched.length > 0) {
                models = matched;
            }
        }

        if (models.length === 0) {
            throw new LlmError({
                code: 'MODEL_NOT_FOUND',
                message:
                    '利用可能なVS Code Language Modelが見つかりません。GitHub Copilot等のLanguage Modelプロバイダーにログインし、Extension Development Host側で有効にしてください。',
            });
        }

        try {
            const response = await models[0].sendRequest(
                [vscode.LanguageModelChatMessage.User(prompt)],
                {},
                token,
            );

            let raw = '';
            for await (const fragment of response.text) {
                raw += fragment;
            }

            const jsonText = raw
                .replace(/^```json\s*/i, '')
                .replace(/\s*```$/, '')
                .trim();
            const parsed = JSON.parse(jsonText) as T;
            return { rawText: raw, parsed };
        } catch (e) {
            throw mapVsCodeLmErrorToLlmError(e);
        }
    }

    /**
     * [Why/Intent] 後方互換性維持のためのメソッド。generateWithRaw を呼び出してパース済みオブジェクトのみを返却する
     */
    public async generate(
        prompt: string,
        token: vscode.CancellationToken,
        modelSelector?: string,
    ): Promise<unknown> {
        const result = await this.generateWithRaw(prompt, token, modelSelector);
        return result.parsed;
    }
}

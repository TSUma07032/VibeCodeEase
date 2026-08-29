import * as vscode from 'vscode';

export class VscodeLmClient {
    /**
     * VS Code Language Model APIを用いてモデルを選択・リクエストを送信し、未検証のJSONレスポンスオブジェクトを返す
     */
    public async generate(prompt: string, token: vscode.CancellationToken): Promise<unknown> {
        const models = await vscode.lm.selectChatModels();
        if (models.length === 0) {
            throw new Error('利用可能なVS Code Language Modelが見つかりません。GitHub Copilot等のLanguage Modelプロバイダーにログインし、Extension Development Host側で有効にしてください。');
        }

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
        return JSON.parse(jsonText);
    }
}

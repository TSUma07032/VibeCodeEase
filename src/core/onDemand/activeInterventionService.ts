/**
 * [Why/Intent] ユーザー逆指名（右クリックコンテキストメニュー ➜ showInputBox ➜ 提案生成）を
 * 統括するサービス。選択範囲の検証、LLM呼出、UUID採番、履歴保存、Webview展開連携を行う。
 */
import * as vscode from 'vscode';
import type { InterventionDetail } from '../../types/onDemandIntervention';
import type { ILlmGateway } from '../llm/llmGateway';
import type { InterventionHistoryStore } from './interventionHistoryStore';

/**
 * [Why/Intent] LLMゲートウェイから構造化出力として返却される逆指名提案のレスポンス構造。
 */
interface ActiveInterventionResponse {
    title: string;
    summary: string;
    proposedCode: string;
}

/**
 * [Why/Intent] ユーザーのコード選択と能動的指示（プロンプト）に基づき、
 * バックグラウンドでAI推敲案を生成してインライン装飾とサイドパネルへ反映するサービス。
 */
export class ActiveInterventionService {
    public constructor(
        readonly _gateway: ILlmGateway,
        readonly _historyStore: InterventionHistoryStore,
    ) {}

    /**
     * [Why/Intent] エディタ上の選択範囲とユーザー入力プロンプトを受け取り、
     * プログレス通知を表示しながら逆指名介入提案を生成・保存・Webview展開する。
     */
    public async requestActiveIntervention(editor: vscode.TextEditor): Promise<string | undefined> {
        if (!editor.selection || editor.selection.isEmpty) {
            void vscode.window.showWarningMessage('コード範囲を選択してから実行してください。');
            return undefined;
        }

        const instruction = await vscode.window.showInputBox({
            prompt: 'AIへの指示・推敲内容を入力してください（例: パフォーマンスを改善して）',
            placeHolder: '指示内容...',
        });

        if (!instruction || instruction.trim() === '') {
            return undefined;
        }

        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'vibeCodeEase: AI提案を生成中...',
                cancellable: false,
            },
            async () => {
                const id = await this.requestActiveInterventionWithInstruction(
                    editor,
                    instruction.trim(),
                );

                if (id) {
                    void vscode.commands.executeCommand('vibecodeease.refreshDecorations');
                    void vscode.commands.executeCommand('vibecodeease.expandIntervention', id);
                }

                return id;
            },
        );
    }

    /**
     * [Why/Intent] 指定された指示テキストと選択範囲のコードに基づき、
     * LLMゲートウェイへ構造化提案の生成をリクエストし、履歴ストアへ永続化して採番したIDを返却する。
     */
    public async requestActiveInterventionWithInstruction(
        editor: vscode.TextEditor,
        instruction: string,
    ): Promise<string | undefined> {
        if (!editor.selection || editor.selection.isEmpty) {
            return undefined;
        }

        const selectedCode = editor.document.getText(editor.selection);
        if (!selectedCode) {
            return undefined;
        }

        const prompt = [
            '以下のコードについて、ユーザーの指示に基づきリファクタリング・改善案を作成してください。',
            `【指示】: ${instruction}`,
            '【対象コード】:',
            '```',
            selectedCode,
            '```',
            '以下のJSON形式で回答してください:',
            'title: 簡潔な提案タイトル',
            'summary: 提案理由と変更内容のサマリー',
            'proposedCode: 改善後の置き換えコード',
        ].join('\n');

        const response = await this._gateway.generateStructured<ActiveInterventionResponse>({
            prompt,
            responseSchema: {},
            token: new vscode.CancellationTokenSource().token,
        });

        const interventionId = `int-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const now = new Date().toISOString();

        const detail: InterventionDetail = {
            id: interventionId,
            title: response?.title ?? 'AIリファクタ提案',
            summary: response?.summary ?? instruction,
            range: {
                start: {
                    line: editor.selection.start.line,
                    character: editor.selection.start.character,
                },
                end: {
                    line: editor.selection.end.line,
                    character: editor.selection.end.character,
                },
            },
            status: 'pending',
            personaId: 'concise',
            originalCode: selectedCode,
            proposedCode: response?.proposedCode ?? selectedCode,
            createdAt: now,
            updatedAt: now,
            chatHistory: [],
        };

        const docUri = editor.document.uri.toString();
        await this._historyStore.saveIntervention(docUri, detail);

        return interventionId;
    }
}

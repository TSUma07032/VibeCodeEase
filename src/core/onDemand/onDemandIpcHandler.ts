/**
 * [Why/Intent] Webviewと拡張機能ホスト間のオンデマンドIPCメッセージディスパッチおよび
 * エディタ置換・排他制御（循環介入防止フラグ）・チャット往復・方針修正（Refine）を統括するハンドラ。
 */
import * as vscode from 'vscode';
import type { ChatMessage, InterventionDetail, PersonaId } from '../../types/onDemandIntervention';
import type {
    ExtensionToWebviewInterventionMessage,
    WebviewToExtensionInterventionMessage,
} from '../../types/onDemandIpcMessages';
import type { ILlmGateway } from '../llm/llmGateway';
import {
    CHAT_RESPONSE_SCHEMA,
    PromptBuilder,
    REFINE_INTERVENTION_RESPONSE_SCHEMA,
} from '../llm/promptBuilder';
import type { InterventionHistoryStore } from './interventionHistoryStore';

/**
 * [Why/Intent] OnDemandIpcHandlerの実行に必要な依存性（Store, Gateway, postMessage, applyEditorEdit, closePanel）を
 * 外部からDI注入するためのコンテキストインターフェース。
 */
export interface OnDemandIpcHandlerContext {
    historyStore: InterventionHistoryStore;
    gateway: ILlmGateway;
    postMessage: (msg: ExtensionToWebviewInterventionMessage) => void;
    applyEditorEdit: (uri: string, originalCode: string, newCode: string) => Promise<boolean>;
    closePanel?: () => void;
    updateQuickSettings?: (settings: {
        personaId?: PersonaId;
        frequency?: 'manual' | 'onSave' | 'interval';
        intervalSeconds?: number;
        model?: string;
    }) => Promise<void>;
    updateApiKey?: (apiKey: string) => Promise<void>;
    expandDetail?: (interventionId: string) => Promise<void>;
}

interface ChatParams {
    documentUri: string;
    interventionId: string;
    personaId: PersonaId;
    text: string;
}

interface ChatQueryParams extends ChatParams {
    detail: InterventionDetail;
}

/**
 * [Why/Intent] Webviewサイドパネルから届く各種アクション（適用/アンドゥ/却下/チャット/方針修正/簡易設定）をディスパッチし、
 * エディタへのコード置換と循環解析抑止フラグの排他制御、およびLLM対話往復を統括するIPCハンドラクラス。
 */
export class OnDemandIpcHandler {
    private _isApplyingIntervention = false;

    public constructor(readonly _ctx: OnDemandIpcHandlerContext) {}

    /**
     * [Why/Intent] コード適用中またはアンドゥ中であるかを示す排他制御フラグ。
     * onDidChangeTextDocument による循環再解析・不要なイベント発火を防止するために参照される。
     */
    public get isApplyingIntervention(): boolean {
        return this._isApplyingIntervention;
    }

    private async findDetail(
        documentUri: string,
        interventionId: string,
    ): Promise<InterventionDetail | undefined> {
        const history = await this._ctx.historyStore.getHistory(documentUri);
        return history.interventions.find((item) => item.id === interventionId);
    }

    private sendSyncHistory(documentUri: string): void {
        void vscode.commands
            .executeCommand('vibecodeease.refreshDecorations')
            .then(undefined, () => {});
        const interventions = this._ctx.historyStore.getInterventions(documentUri);
        this._ctx.postMessage({
            type: 'SYNC_HISTORY_STATE',
            payload: {
                documentUri,
                interventions,
            },
        });
    }

    /**
     * [Why/Intent] 提案されたコードをエディタへ適用し、履歴ステータスを 'applied' へ更新する。
     * 置換処理中は `_isApplyingIntervention` 排他フラグを true に設定することで、
     * ドキュメント変更リスナーからの二重検知や不要な循環推敲ループの誘発を確実に防止する。
     */
    private async handleApply(documentUri: string, interventionId: string): Promise<void> {
        const detail = await this.findDetail(documentUri, interventionId);
        if (!detail) {
            return;
        }

        this._isApplyingIntervention = true;
        try {
            await this._ctx.applyEditorEdit(documentUri, detail.originalCode, detail.proposedCode);
            await this._ctx.historyStore.updateStatus(documentUri, interventionId, 'applied');
        } finally {
            this._isApplyingIntervention = false;
        }

        this.sendSyncHistory(documentUri);
    }

    /**
     * [Why/Intent] 適用済みの提案コードを変更前（originalCode）へ復元し、履歴ステータスを 'reverted' へ更新する。
     * 置換処理中は `_isApplyingIntervention` 排他フラグを保護し、ドキュメント変更リスナーによる循環ループを防ぐ。
     */
    private async handleUndo(documentUri: string, interventionId: string): Promise<void> {
        const detail = await this.findDetail(documentUri, interventionId);
        if (!detail) {
            return;
        }

        this._isApplyingIntervention = true;
        try {
            await this._ctx.applyEditorEdit(documentUri, detail.proposedCode, detail.originalCode);
            await this._ctx.historyStore.updateStatus(documentUri, interventionId, 'reverted');
        } finally {
            this._isApplyingIntervention = false;
        }

        this.sendSyncHistory(documentUri);
    }

    /**
     * [Why/Intent] 提案を却下し、履歴ストア内のステータスを 'dismissed' へ更新する。
     * 更新後はWebviewおよびエディタ装飾へ最新状態を同期伝播させる。
     */
    private async handleDiscard(documentUri: string, interventionId: string): Promise<void> {
        await this._ctx.historyStore.updateStatus(documentUri, interventionId, 'dismissed');
        this.sendSyncHistory(documentUri);
    }

    /**
     * [Why/Intent] ペルソナと提案コンテキストを付与したプロンプトを構築してLLMへ問い合わせ、AI回答を履歴へ永続化してWebviewへ通知する。
     * 通信エラー発生時はフォールバック応答メッセージを履歴に記録してUIへ伝達し、finally 節で `SET_CHAT_LOADING` (false) を送信してスピナー表示を安全に解除する。
     */
    private async executeChatQuery(params: ChatQueryParams): Promise<void> {
        const { documentUri, interventionId, personaId, text, detail } = params;
        try {
            const prompt = PromptBuilder.buildChatPrompt(personaId, detail, text);
            const response = await this._ctx.gateway.generateStructured<{
                text?: string;
                message?: string;
            }>({
                prompt,
                responseSchema: CHAT_RESPONSE_SCHEMA,
                token: new vscode.CancellationTokenSource().token,
            });

            const replyText = response?.text ?? response?.message ?? 'AIからの応答を受信しました。';

            const updatedDetail = await this._ctx.historyStore.addChatMessage(
                documentUri,
                interventionId,
                {
                    sender: 'ai',
                    message: replyText,
                    personaId,
                },
            );

            const lastMessage = updatedDetail?.chatHistory[
                updatedDetail.chatHistory.length - 1
            ] ?? {
                id: `msg-${Date.now()}`,
                sender: 'ai',
                message: replyText,
                timestamp: new Date().toISOString(),
                personaId,
            };

            this._ctx.postMessage({
                type: 'RECEIVE_CHAT_MESSAGE',
                payload: {
                    interventionId,
                    message: lastMessage,
                },
            });
        } catch {
            const errorDetail = await this._ctx.historyStore.addChatMessage(
                documentUri,
                interventionId,
                {
                    sender: 'ai',
                    message: '⚠️ エラーが発生しました。再試行してください。',
                    personaId,
                },
            );

            const errorMsg: ChatMessage = errorDetail?.chatHistory[
                errorDetail.chatHistory.length - 1
            ] ?? {
                id: `err-${Date.now()}`,
                sender: 'ai',
                message: '⚠️ エラーが発生しました。再試行してください。',
                timestamp: new Date().toISOString(),
                personaId,
            };

            this._ctx.postMessage({
                type: 'RECEIVE_CHAT_MESSAGE',
                payload: {
                    interventionId,
                    message: errorMsg,
                },
            });
        } finally {
            this._ctx.postMessage({
                type: 'SET_CHAT_LOADING',
                payload: { interventionId, isLoading: false },
            });
        }
    }

    /**
     * [Why/Intent] チャット要求を受信した際、Webviewへローディング開始を通知し、ユーザーメッセージを履歴ストアへ先行永続化する。
     * 該当詳細の存在確認後にLLM対話クエリ（executeChatQuery）を実行し、対象が存在しない場合は安全にローディングを解除する。
     */
    private async handleChat(params: ChatParams): Promise<void> {
        const { documentUri, interventionId, text } = params;
        this._ctx.postMessage({
            type: 'SET_CHAT_LOADING',
            payload: { interventionId, isLoading: true },
        });

        await this._ctx.historyStore.addChatMessage(documentUri, interventionId, {
            sender: 'user',
            message: text,
        });

        const detail = await this.findDetail(documentUri, interventionId);
        if (!detail) {
            this._ctx.postMessage({
                type: 'SET_CHAT_LOADING',
                payload: { interventionId, isLoading: false },
            });
            return;
        }

        await this.executeChatQuery({ ...params, detail });
    }

    /**
     * [Why/Intent] ユーザーからの方針修正指示に基づき、LLMに修正コードと理由を再推敲させ、
     * 履歴ストアを更新してWebviewへ最新レコードを通知する。
     */
    public async handleRefine(
        documentUri: string,
        payload: { interventionId: string; userInstruction: string; personaId: PersonaId },
    ): Promise<void> {
        const { interventionId, userInstruction, personaId } = payload;
        this._ctx.postMessage({
            type: 'SET_REFINE_LOADING',
            payload: { interventionId, isLoading: true },
        });

        try {
            const detail = await this.findDetail(documentUri, interventionId);
            if (!detail) {
                return;
            }

            const prompt = PromptBuilder.buildRefinePrompt(personaId, detail, userInstruction);
            const response = await this._ctx.gateway.generateStructured<{
                proposedCode?: string;
                summary?: string;
            }>({
                prompt,
                responseSchema: REFINE_INTERVENTION_RESPONSE_SCHEMA,
                token: new vscode.CancellationTokenSource().token,
            });

            const newCode = response?.proposedCode ?? detail.proposedCode;
            const newSummary = response?.summary ?? detail.summary;

            const updated = await this._ctx.historyStore.updateProposal(
                documentUri,
                interventionId,
                {
                    proposedCode: newCode,
                    summary: newSummary,
                },
            );

            if (updated) {
                this._ctx.postMessage({
                    type: 'UPDATE_INTERVENTION_DETAIL',
                    payload: { interventionId, detail: updated },
                });
                this.sendSyncHistory(documentUri);
            }
        } catch {
            this._ctx.postMessage({
                type: 'SET_REFINE_LOADING',
                payload: {
                    interventionId,
                    isLoading: false,
                    error: 'AIによる再推敲に失敗しました',
                },
            });
        } finally {
            this._ctx.postMessage({
                type: 'SET_REFINE_LOADING',
                payload: { interventionId, isLoading: false },
            });
        }
    }

    /**
     * [Why/Intent] Webviewから受信したメッセージの種別に応じ、各処理へ分岐ディスパッチする。
     */
    public async handleMessage(
        message: WebviewToExtensionInterventionMessage,
        documentUri: string,
    ): Promise<void> {
        switch (message.type) {
            case 'APPLY_INTERVENTION':
                await this.handleApply(documentUri, message.payload.interventionId);
                break;
            case 'UNDO_INTERVENTION':
                await this.handleUndo(documentUri, message.payload.interventionId);
                break;
            case 'DISCARD_INTERVENTION':
                await this.handleDiscard(documentUri, message.payload.interventionId);
                break;
            case 'REFINE_INTERVENTION':
                await this.handleRefine(documentUri, message.payload);
                break;
            case 'UPDATE_QUICK_SETTINGS':
                await this._ctx.updateQuickSettings?.(message.payload);
                break;
            case 'UPDATE_API_KEY':
                await this._ctx.updateApiKey?.(message.payload.apiKey);
                break;
            case 'REQUEST_EXPAND_DETAIL':
                await this._ctx.expandDetail?.(message.payload.interventionId);
                break;
            case 'SEND_CHAT_MESSAGE': {
                const { interventionId, personaId, text } = message.payload;
                await this.handleChat({ documentUri, interventionId, personaId, text });
                break;
            }
            case 'CLOSE_SIDE_PANEL':
                this._ctx.closePanel?.();
                break;
            case 'SWITCH_PERSONA':
            case 'REQUEST_ACTIVE_INTERVENTION':
                break;
        }
    }
}

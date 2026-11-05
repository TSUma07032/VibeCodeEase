/**
 * [Why/Intent] Webviewと拡張機能ホスト間のオンデマンドIPCメッセージディスパッチおよび
 * エディタ置換・排他制御（循環介入防止フラグ）・チャット往復を統括するハンドラ。
 */
import * as vscode from 'vscode';
import type { ChatMessage, InterventionDetail, PersonaId } from '../../types/onDemandIntervention';
import type {
    ExtensionToWebviewInterventionMessage,
    WebviewToExtensionInterventionMessage,
} from '../../types/onDemandIpcMessages';
import type { ILlmGateway } from '../llm/llmGateway';
import { PromptBuilder } from '../llm/promptBuilder';
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
 * [Why/Intent] Webviewサイドパネルから届く各種アクション（適用/アンドゥ/却下/チャット/クパルソナ切替）をディスパッチし、
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
        const interventions = this._ctx.historyStore.getInterventions(documentUri);
        this._ctx.postMessage({
            type: 'SYNC_HISTORY_STATE',
            payload: {
                documentUri,
                interventions,
            },
        });
    }

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

    private async handleDiscard(documentUri: string, interventionId: string): Promise<void> {
        await this._ctx.historyStore.updateStatus(documentUri, interventionId, 'dismissed');
        this.sendSyncHistory(documentUri);
    }

    private async executeChatQuery(params: ChatQueryParams): Promise<void> {
        const { documentUri, interventionId, personaId, text, detail } = params;
        try {
            const prompt = PromptBuilder.buildChatPrompt(personaId, detail, text);
            const response = await this._ctx.gateway.generateStructured<{
                text?: string;
                message?: string;
            }>({
                prompt,
                responseSchema: {},
                token: new vscode.CancellationTokenSource().token,
            });

            const replyText = response?.text ?? response?.message ?? 'AIからの応答を受信しました。';

            const updatedDetail = await this._ctx.historyStore.addChatMessage(
                documentUri,
                interventionId,
                {
                    sender: 'ai',
                    message: replyText,
                },
            );

            const lastMessage = updatedDetail?.chatHistory[
                updatedDetail.chatHistory.length - 1
            ] ?? {
                id: `msg-${Date.now()}`,
                sender: 'ai',
                message: replyText,
                timestamp: new Date().toISOString(),
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
                },
            );

            const errorMsg: ChatMessage = errorDetail?.chatHistory[
                errorDetail.chatHistory.length - 1
            ] ?? {
                id: `err-${Date.now()}`,
                sender: 'ai',
                message: '⚠️ エラーが発生しました。再試行してください。',
                timestamp: new Date().toISOString(),
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
     * [Why/Intent] Webviewから受信したメッセージの種別に応じ、各処理（適用、アンドゥ、破棄、対話、パネル破棄）へ分岐ディスパッチする。
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

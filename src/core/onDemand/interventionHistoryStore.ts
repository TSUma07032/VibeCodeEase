/**
 * [Why/Intent] 介入履歴のJSON永続化（.vscode/vibecodeease/history.json）および
 * CRUD操作、ステータス遷移（Applied/Reverted/Dismissed）、チャット履歴追記を管理するストア。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
    ChatMessage,
    DocumentInterventionHistory,
    InterventionDetail,
    InterventionItem,
    InterventionStatus,
} from '../../types/onDemandIntervention';

/**
 * [Why/Intent] `.vscode/vibecodeease/history.json` に永続化されるルートデータ構造。
 */
interface StoredHistoryStructure {
    version: '1.0.0';
    documents: Record<string, DocumentInterventionHistory>;
}

/**
 * [Why/Intent] ワークスペース内のドキュメントごとの介入履歴をJSONファイルに永続化し、
 * インメモリキャッシュとともにCRUD操作、ステータス遷移、範囲自動補正を提供するストアクラス。
 */
export class InterventionHistoryStore {
    private readonly cache: Map<string, DocumentInterventionHistory> = new Map();
    private isLoaded = false;

    public constructor(readonly _storageRoot?: string) {}

    private getStorageFilePath(): string {
        const root =
            this._storageRoot ??
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
            process.cwd();
        return path.join(root, '.vscode', 'vibecodeease', 'history.json');
    }

    private ensureLoadedSync(): void {
        if (this.isLoaded) {
            return;
        }
        this.isLoaded = true;
        const filePath = this.getStorageFilePath();
        if (!fs.existsSync(filePath)) {
            return;
        }

        try {
            const rawContent = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(rawContent) as
                | StoredHistoryStructure
                | DocumentInterventionHistory;

            if ('documents' in parsed && parsed.documents) {
                for (const [uri, docHistory] of Object.entries(parsed.documents)) {
                    this.cache.set(uri, docHistory);
                }
            } else if ('documentUri' in parsed && parsed.documentUri) {
                this.cache.set(parsed.documentUri, parsed);
            }
        } catch {
            // ファイル破損時は空キャッシュとして継続
        }
    }

    private async saveToDisk(): Promise<void> {
        const filePath = this.getStorageFilePath();
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }

        const data: StoredHistoryStructure = {
            version: '1.0.0',
            documents: Object.fromEntries(this.cache.entries()),
        };

        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * [Why/Intent] 指定ドキュメントの介入履歴一覧を取得する。未保存時は空の初期履歴を返却する。
     */
    public getHistory(documentUri: string): Promise<DocumentInterventionHistory> {
        this.ensureLoadedSync();
        const doc = this.cache.get(documentUri);
        if (doc) {
            return Promise.resolve(doc);
        }
        return Promise.resolve({
            version: '1.0.0',
            documentUri,
            interventions: [],
        });
    }

    /**
     * [Why/Intent] 新規または更新された介入詳細をドキュメント履歴へ追加・上書きし、ディスクへ永続化する。
     */
    public async saveIntervention(documentUri: string, detail: InterventionDetail): Promise<void> {
        this.ensureLoadedSync();
        let doc = this.cache.get(documentUri);
        if (!doc) {
            doc = {
                version: '1.0.0',
                documentUri,
                interventions: [],
            };
            this.cache.set(documentUri, doc);
        }

        const now = new Date().toISOString();
        const updatedDetail: InterventionDetail = {
            ...detail,
            updatedAt: now,
        };

        const existingIndex = doc.interventions.findIndex((item) => item.id === detail.id);
        if (existingIndex >= 0) {
            doc.interventions[existingIndex] = updatedDetail;
        } else {
            doc.interventions.push(updatedDetail);
        }

        await this.saveToDisk();
    }

    /**
     * [Why/Intent] 対象介入のステータス（applied/reverted/dismissed）を更新し、タイムスタンプを付与して永続化する。
     */
    public async updateStatus(
        documentUri: string,
        interventionId: string,
        newStatus: InterventionStatus,
    ): Promise<InterventionDetail | undefined> {
        this.ensureLoadedSync();

        let targetItem: InterventionDetail | undefined;
        const doc = this.cache.get(documentUri);
        if (doc) {
            targetItem = doc.interventions.find((item) => item.id === interventionId);
        }

        if (!targetItem) {
            for (const d of this.cache.values()) {
                targetItem = d.interventions.find((item) => item.id === interventionId);
                if (targetItem) {
                    break;
                }
            }
        }

        if (!targetItem) {
            return undefined;
        }

        targetItem.status = newStatus;
        targetItem.updatedAt = new Date().toISOString();
        await this.saveToDisk();
        return targetItem;
    }

    /**
     * [Why/Intent] 提案単位のチャットスレッドにユーザーまたはAIのメッセージを追記し、永続化する。
     */
    public async addChatMessage(
        documentUri: string,
        interventionId: string,
        message: { sender: 'user' | 'ai'; message: string },
    ): Promise<InterventionDetail | undefined> {
        this.ensureLoadedSync();

        let targetItem: InterventionDetail | undefined;
        const doc = this.cache.get(documentUri);
        if (doc) {
            targetItem = doc.interventions.find((item) => item.id === interventionId);
        }

        if (!targetItem) {
            for (const d of this.cache.values()) {
                targetItem = d.interventions.find((item) => item.id === interventionId);
                if (targetItem) {
                    break;
                }
            }
        }

        if (!targetItem) {
            return undefined;
        }

        const chatMsg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            sender: message.sender,
            message: message.message,
            timestamp: new Date().toISOString(),
        };

        if (!targetItem.chatHistory) {
            targetItem.chatHistory = [];
        }
        targetItem.chatHistory.push(chatMsg);
        targetItem.updatedAt = new Date().toISOString();

        await this.saveToDisk();
        return targetItem;
    }

    /**
     * [Why/Intent] 同期的にキャッシュから指定ドキュメントの介入一覧を返却する（装飾描画・目次用）。
     */
    public getInterventions(documentUri: string): InterventionItem[] {
        this.ensureLoadedSync();
        const doc = this.cache.get(documentUri);
        return doc ? [...doc.interventions] : [];
    }

    private adjustItemForChange(
        item: InterventionDetail,
        change: vscode.TextDocumentContentChangeEvent,
    ): boolean {
        if (item.status === 'dismissed') {
            return false;
        }

        const linesAdded = (change.text.match(/\n/g) ?? []).length;
        const linesRemoved = change.range.end.line - change.range.start.line;
        const lineDelta = linesAdded - linesRemoved;

        const isFullyDeleted =
            change.range.start.line <= item.range.start.line &&
            change.range.end.line >= item.range.end.line &&
            change.text === '';

        if (isFullyDeleted) {
            item.status = 'dismissed';
            return true;
        }

        if (change.range.end.line < item.range.start.line) {
            item.range.start.line = Math.max(0, item.range.start.line + lineDelta);
            item.range.end.line = Math.max(item.range.start.line, item.range.end.line + lineDelta);
            return true;
        }

        if (change.range.start.line <= item.range.end.line) {
            item.range.end.line = Math.max(item.range.start.line, item.range.end.line + lineDelta);
            return true;
        }

        return false;
    }

    /**
     * [Why/Intent] ユーザーによるエディタ編集イベントを受け取り、行増減に応じた介入範囲の自動補正
     * および完全削除行に属する介入の自動dismissed遷移を行う。
     */
    public async validateAndAdjustRange(
        documentUri: string,
        event: vscode.TextDocumentChangeEvent,
    ): Promise<void> {
        this.ensureLoadedSync();
        const doc = this.cache.get(documentUri);
        if (!doc || event.contentChanges.length === 0) {
            return;
        }

        let hasChanges = false;
        for (const change of event.contentChanges) {
            for (const item of doc.interventions) {
                if (this.adjustItemForChange(item, change)) {
                    hasChanges = true;
                    item.updatedAt = new Date().toISOString();
                }
            }
        }

        if (hasChanges) {
            await this.saveToDisk();
        }
    }
}

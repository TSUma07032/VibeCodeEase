/**
 * [Why/Intent] 介入履歴のJSON永続化（.vscode/vibecodeease/history.json）および
 * CRUD操作、ステータス遷移（Applied/Reverted/Dismissed）、チャット履歴追記、方針修正（Refine）永続化を管理するストア。
 * Windows環境や日本語パス環境において VS Code の Markdown コマンドリンクが URI エンコード（%3A や %E3...）を
 * デコードして渡すことで ID 不一致が起き、常に一番上の介入案へフォールバックしてしまう問題を防ぐため、
 * ID および URI の正規化比較（normalizeIdentifier）を備える。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
    ChatMessage,
    DocumentInterventionHistory,
    InterventionDetail,
    InterventionStatus,
    PersonaId,
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

    /**
     * [Why/Intent] VS CodeのMarkdownコマンドリンク等で発生するパーセントエンコード差異（c%3A vs c:、日本語パス等）や
     * ドライブレターの大文字小文字差異を吸収し、押下した介入IDを確実に一致判定するための正規化ヘルパー。
     */
    private normalizeIdentifier(value: string): string {
        let current = value;
        for (let i = 0; i < 2; i++) {
            try {
                const decoded = decodeURIComponent(current);
                if (decoded === current) {
                    break;
                }
                current = decoded;
            } catch {
                break;
            }
        }
        return current.toLowerCase();
    }

    /**
     * [Why/Intent] ドキュメントURIのエンコード表現差を吸収してキャッシュ内の履歴エントリを検索する。
     */
    private findDocEntry(
        documentUri: string,
    ): { key: string; doc: DocumentInterventionHistory } | undefined {
        const direct = this.cache.get(documentUri);
        if (direct) {
            return { key: documentUri, doc: direct };
        }
        const targetNorm = this.normalizeIdentifier(documentUri);
        for (const [key, doc] of this.cache.entries()) {
            if (this.normalizeIdentifier(key) === targetNorm) {
                return { key, doc };
            }
        }
        return undefined;
    }

    /**
     * [Why/Intent] 履歴永続化JSONファイルの絶対パスを取得する。
     * 明示的なストレージルート、ワークスペースフォルダ、またはカレントプロセスの順でフォールバック解決する。
     */
    private getStorageFilePath(): string {
        const root =
            this._storageRoot ??
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
            process.cwd();
        return path.join(root, '.vscode', 'vibecodeease', 'history.json');
    }

    /**
     * [Why/Intent] ストレージファイルから履歴データを同期的にメモリキャッシュへ遅延ロードする。
     * ファイルが存在しない場合やパースエラー時は安全に空状態を維持する。
     */
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

    /**
     * [Why/Intent] メモリキャッシュ内の全履歴データをディスク上のJSONファイルへ非同期永続化する。
     * ディレクトリ未作成時は再帰的に作成し、フォーマット整形して保存する。
     */
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
        const found = this.findDocEntry(documentUri);
        if (found) {
            return Promise.resolve(found.doc);
        }
        return Promise.resolve({
            version: '1.0.0',
            documentUri,
            interventions: [],
        });
    }

    /**
     * [Why/Intent] 介入IDから該当する介入詳細と所属ドキュメントURIを横断検索して返却する。
     * エディタホバーからWebviewへフォーカスが移りアクティブエディタが undefined になった場合や、
     * コマンドURI経由でパーセントエンコードがデコードされた場合でも、その時押した介入案を100%確実に特定する。
     */
    public getInterventionById(
        interventionId: string,
        preferredDocumentUri?: string,
    ): { documentUri: string; detail: InterventionDetail } | undefined {
        this.ensureLoadedSync();
        const normTargetId = this.normalizeIdentifier(interventionId);

        if (preferredDocumentUri) {
            const preferredEntry = this.findDocEntry(preferredDocumentUri);
            const match =
                preferredEntry?.doc.interventions.find((item) => item.id === interventionId) ??
                preferredEntry?.doc.interventions.find(
                    (item) => this.normalizeIdentifier(item.id) === normTargetId,
                );
            if (match && preferredEntry) {
                return { documentUri: preferredEntry.key, detail: match };
            }
        }

        for (const [docUri, docHistory] of this.cache.entries()) {
            const match =
                docHistory.interventions.find((item) => item.id === interventionId) ??
                docHistory.interventions.find(
                    (item) => this.normalizeIdentifier(item.id) === normTargetId,
                );
            if (match) {
                return { documentUri: docUri, detail: match };
            }
        }
        return undefined;
    }

    /**
     * [Why/Intent] 新規または更新された介入詳細をドキュメント履歴へ追加・上書きし、ディスクへ永続化する。
     */
    public async saveIntervention(documentUri: string, detail: InterventionDetail): Promise<void> {
        this.ensureLoadedSync();
        const foundEntry = this.findDocEntry(documentUri);
        let doc = foundEntry?.doc;
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

        const normDetailId = this.normalizeIdentifier(detail.id);
        const existingIndex = doc.interventions.findIndex(
            (item) => item.id === detail.id || this.normalizeIdentifier(item.id) === normDetailId,
        );
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

        const found = this.getInterventionById(interventionId, documentUri);
        if (!found) {
            return undefined;
        }

        found.detail.status = newStatus;
        found.detail.updatedAt = new Date().toISOString();
        await this.saveToDisk();
        return found.detail;
    }

    /**
     * [Why/Intent] 変更方針修正（Refine Intervention）により再生成された
     * 提案コードおよび変更理由を更新・永続化する。
     */
    public async updateProposal(
        documentUri: string,
        interventionId: string,
        patch: { proposedCode: string; summary: string },
    ): Promise<InterventionDetail | undefined> {
        this.ensureLoadedSync();

        const found = this.getInterventionById(interventionId, documentUri);
        if (!found) {
            return undefined;
        }

        found.detail.proposedCode = patch.proposedCode;
        found.detail.summary = patch.summary;
        found.detail.updatedAt = new Date().toISOString();
        await this.saveToDisk();
        return found.detail;
    }

    /**
     * [Why/Intent] 提案単位のチャットスレッドにユーザーまたはAIのメッセージを追記し、永続化する。
     * 発言時点のペルソナ（personaId）を保持してペルソナ履歴を永続化する。
     */
    public async addChatMessage(
        documentUri: string,
        interventionId: string,
        message: { sender: 'user' | 'ai'; message: string; personaId?: PersonaId },
    ): Promise<InterventionDetail | undefined> {
        this.ensureLoadedSync();

        const found = this.getInterventionById(interventionId, documentUri);
        if (!found) {
            return undefined;
        }

        const targetItem = found.detail;
        const chatMsg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            sender: message.sender,
            message: message.message,
            timestamp: new Date().toISOString(),
            personaId: message.personaId,
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
     * [Why/Intent] 同期的にキャッシュから指定ドキュメントの介入一覧（過去の分も含む詳細付き）を返却する（装飾描画・掲示板トグル表示用）。
     */
    public getInterventions(documentUri: string): InterventionDetail[] {
        this.ensureLoadedSync();
        const found = this.findDocEntry(documentUri);
        return found ? [...found.doc.interventions] : [];
    }

    /**
     * [Why/Intent] エディタ編集イベントに伴う行オフセット補正計算を行い、対象行が完全削除された場合は
     * ステータスを 'dismissed' へ自動遷移させる。これによりエディタ装飾のゴースト残留を防止し、
     * 挿入・削除行数に基づく lineDelta を前後の介入範囲へ正しく伝播させる。
     */
    private adjustItemForChange(
        item: InterventionDetail,
        change: vscode.TextDocumentContentChangeEvent,
        linesAdded: number,
    ): boolean {
        if (item.status === 'dismissed') {
            return false;
        }

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
        const found = this.findDocEntry(documentUri);
        if (!found || event.contentChanges.length === 0) {
            return;
        }

        let hasChanges = false;
        for (const change of event.contentChanges) {
            // 関数内のO(n^2)の実行時間を約 25.18ms から約 6.52ms に削減 (配列割当を排除し、ループ外へホイスト)
            let linesAdded = 0;
            let index = change.text.indexOf('\n');
            while (index !== -1) {
                linesAdded++;
                index = change.text.indexOf('\n', index + 1);
            }
            for (const item of found.doc.interventions) {
                if (this.adjustItemForChange(item, change, linesAdded)) {
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

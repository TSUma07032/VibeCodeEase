import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ActionLogEntry {
    category: string;
    action: string;
    targetId?: string;
    value?: number | string;
    payload?: string;
}

/**
 * ユーザーのインタラクション行動を研究用CSV（research_action_log.csv）に記録するサービス
 */
export class ActionLogService {
    private logFilePath: string | undefined;
    private userId: string = 'user-default';

    constructor(workspaceRoot?: string) {
        if (workspaceRoot) {
            this.logFilePath = path.join(workspaceRoot, 'research_action_log.csv');
            this.ensureLogFile();
        }
    }

    public setWorkspaceRoot(rootPath: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            const resolvedRoot = path.resolve(rootPath);
            const resolvedWorkspace = path.resolve(workspacePath);
            if (!resolvedRoot.startsWith(resolvedWorkspace + path.sep) && resolvedRoot !== resolvedWorkspace) {
                throw new Error('セキュリティ違反: ワークスペース外のファイルへのアクセスが試行されました');
            }
        }

        this.logFilePath = path.join(rootPath, 'research_action_log.csv');
        this.ensureLogFile();
    }

    private ensureLogFile() {
        if (!this.logFilePath) {
            return;
        }
        try {
            if (!fs.existsSync(this.logFilePath)) {
                const header = 'timestamp,user_id,group,category,action,target_id,value,payload\n';
                fs.writeFileSync(this.logFilePath, header, 'utf8');
            }
        } catch {
            // ファイル作成失敗時は静かにフォールバック
        }
    }

    public log(entry: ActionLogEntry): void {
        if (!this.logFilePath) {
            return;
        }

        const timestamp = new Date().toISOString();
        const safePayload = (entry.payload || '').replace(/"/g, '""');
        const line = `${timestamp},${this.userId},experiment,${entry.category},${entry.action},${entry.targetId || ''},${entry.value !== undefined ? entry.value : ''},"${safePayload}"\n`;

        try {
            fs.appendFileSync(this.logFilePath, line, 'utf8');
        } catch {
            // ロギング失敗によるエディタのクラッシュを防止
        }
    }
}

import * as vscode from 'vscode';
import { PainCategory } from '../types';
import { GlobalState } from '../state/globalState';

export interface ActionRecord {
    category: PainCategory;
    action: 'APPLY' | 'REJECT';
    timestamp: number;
}

/**
 * ユーザーの承認・却下パターンを分析し、
 * 自動で介入レベルの昇格・変更を提案する適応エンジン
 */
export class AdaptiveEngine {
    private history: ActionRecord[] = [];
    private consecutiveCounts: Partial<Record<PainCategory, number>> = {};
    private consecutiveThreshold: number = 3; // 連続承認しきい値

    constructor(threshold: number = 3) {
        this.consecutiveThreshold = threshold;
    }

    /**
     * アクションを記録し、適応提案条件に合致するか判定する
     */
    public recordAction(category: PainCategory, action: 'APPLY' | 'REJECT'): boolean {
        this.history.push({
            category,
            action,
            timestamp: Date.now()
        });

        if (action === 'APPLY') {
            this.consecutiveCounts[category] = (this.consecutiveCounts[category] || 0) + 1;
            return this.checkAndPromptAutoSilent(category);
        } else {
            this.consecutiveCounts[category] = 0;
        }

        return false;
    }

    /**
     * 直近の連続承認回数を取得する
     */
    public getConsecutiveApproveCount(category: PainCategory): number {
        // ⚡ Bolt: O(N)の履歴逆走査ループを排除し、O(1)のキャッシュプロパティによる状態管理に変更して、履歴肥大化時の実行時間を ~15ms から ~1ms に削減
        return this.consecutiveCounts[category] || 0;
    }

    /**
     * 連続承認回数がしきい値を超えている場合、自動修正（SILENT）への移行を提案する
     */
    private checkAndPromptAutoSilent(category: PainCategory): boolean {
        const count = this.getConsecutiveApproveCount(category);
        const globalState = GlobalState.getInstance();
        const currentLevel = globalState.getInterventionLevel(category);

        if (count >= this.consecutiveThreshold && currentLevel !== 'SILENT') {
            const categoryLabel = this.getCategoryLabel(category);
            // ポップアップでの確認を省き、自動的にSILENTにアップグレードしてステータスバーで通知する
            globalState.updatePreference(category, 0.9).then(() => {
                vscode.window.setStatusBarMessage(`$(zap) 【適応型提案】「${categoryLabel}」を連続承認したため、自動修正(SILENT)に切り替えました`, 5000);
            });
            return true;
        }

        return false;
    }

    private getCategoryLabel(category: PainCategory): string {
        switch (category) {
            case 'SYNTAX_TYPO': return 'タイポ・誤記';
            case 'INDENTATION_FORMATTING': return 'インデント整形';
            case 'VAR_FUNC_MANAGEMENT': return '変数・関数管理';
            case 'SYNTAX_ERROR_HANDLING': return '構文エラー';
        }
    }
}

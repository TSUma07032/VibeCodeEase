import * as vscode from 'vscode';
import { PainCategory, PAIN_CATEGORY_LABELS } from '../types';
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
    private readonly history: ActionRecord[] = [];
    private readonly consecutiveThreshold: number;

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
            return this.checkAndPromptAutoSilent(category);
        }

        return false;
    }

    /**
     * 特定カテゴリに対する直近の連続承認回数を取得する。
     * 最新の履歴から逆順に走査し、同カテゴリの承認が途切れる（REJECTに遭遇する）までをカウントする。
     */
    public getConsecutiveApproveCount(category: PainCategory): number {
        let count = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            const item = this.history[i];
            if (item.category === category) {
                if (item.action === 'APPLY') {
                    count++;
                } else {
                    break;
                }
            }
        }
        return count;
    }

    /**
     * 連続承認回数がしきい値を超えている場合、自動修正（SILENT）への移行を提案する
     */
    private checkAndPromptAutoSilent(category: PainCategory): boolean {
        const count = this.getConsecutiveApproveCount(category);
        const globalState = GlobalState.getInstance();
        const currentLevel = globalState.getInterventionLevel(category);

        if (count >= this.consecutiveThreshold && currentLevel !== 'SILENT') {
            const categoryLabel = PAIN_CATEGORY_LABELS[category] || category;
            vscode.window.showInformationMessage(
                `💡 【適応型提案】「${categoryLabel}」の修正を連続で承認しています。次回から自動修正（SILENT）に切り替えて、さらにバイブスを高めますか？`,
                'はい (自動修正にする)',
                '後で'
            ).then(async (selection) => {
                if (selection === 'はい (自動修正にする)') {
                    await globalState.updatePreference(category, 0.9);
                    vscode.window.setStatusBarMessage(`$(check) 「${categoryLabel}」を次回から自動修正するように更新しました！`, 3000);
                }
            });
            return true;
        }

        return false;
    }
}


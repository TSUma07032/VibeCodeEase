/**
 * [Why/Intent] 学習セッションの状態、履歴スナップショット、スヌーズ状態を一元管理し、Memento永続化および変更イベント通知を行う。
 */
import * as vscode from 'vscode';
import type {
    LearningSessionState,
    ShadowPredictionResult,
    SnapshotHistoryItem,
    StagnationAssessment,
} from '../../types/learningScaffolding';
import { LEARNING_CONFIG } from './defaultLearningConfig';

/**
 * [Why/Intent] 状態の更新・永続化・イベント発火を一元化するストアクラス。
 */
export class LearningSessionStore implements vscode.Disposable {
    private readonly _onDidChangeState = new vscode.EventEmitter<LearningSessionState>();
    /** [Why/Intent] 状態更新を外部（SideEditorProvider等）へ購読させるためのイベント */
    public readonly onDidChangeState: vscode.Event<LearningSessionState> =
        this._onDidChangeState.event;

    private _state: LearningSessionState;
    private _history: SnapshotHistoryItem[] = [];

    /**
     * [Why/Intent] VS Code Mementoを受け取り、永続化されたセッション情報があれば復元、なければ初期状態でメモリ構築する。
     */
    constructor(private readonly memento?: vscode.Memento) {
        const saved = this.memento?.get<LearningSessionState>(LEARNING_CONFIG.STORAGE_KEY);
        this._state = saved ?? this.createInitialState();
        if (saved?.history) {
            this._history = [...saved.history];
        }
    }

    /** [Why/Intent] 初期セッション状態を安全に構築するファクトリ */
    private createInitialState(): LearningSessionState {
        return {
            taskId: '',
            taskDescription: '',
            learningGoal: '',
            status: 'empty',
            disclosureMode: 'stepByStep',
            unlockedLevel: 1,
            latestPrediction: null,
            assessment: {
                isStagnated: false,
                consecutiveStagnantCount: 0,
                reason: 'NONE',
                confidence: 0,
            },
            snoozeUntilTimestamp: null,
            isDismissed: false,
            lastUpdatedTimestamp: Date.now(),
            history: [],
        };
    }

    /** [Why/Intent] 現在のセッション状態のイミュータブルなコピーを取得する */
    public getState(): LearningSessionState {
        return {
            ...this._state,
            history: [...this._history],
        };
    }

    /** [Why/Intent] スナップショット履歴のコピーを取得する */
    public getHistory(): SnapshotHistoryItem[] {
        return [...this._history];
    }

    /** [Why/Intent] 新規学習セッションを開始し、ローディング状態へ移行する */
    public startSession(params: { taskDescription: string; learningGoal: string }): void {
        this._state = {
            ...this.createInitialState(),
            taskId: Date.now().toString(),
            taskDescription: params.taskDescription,
            learningGoal: params.learningGoal,
            status: 'loading',
            lastUpdatedTimestamp: Date.now(),
            history: [],
        };
        this._history = [];
        this.saveAndNotify();
    }

    /** [Why/Intent] セッションを終了し、初期状態へリセットする */
    public stopSession(): void {
        this._state = this.createInitialState();
        this._history = [];
        this.saveAndNotify();
    }

    /** [Why/Intent] 履歴スナップショットを追加し、FIFOで最大件数を維持する */
    public addHistoryItem(item: SnapshotHistoryItem): void {
        this._history.push(item);
        if (this._history.length > LEARNING_CONFIG.MAX_HISTORY_LENGTH) {
            this._history.shift();
        }
        this._state.history = [...this._history];
        this.saveAndNotify();
    }

    /** [Why/Intent] LLM解析結果を反映し、成功状態へ遷移する */
    public setPrediction(prediction: ShadowPredictionResult): void {
        this._state.latestPrediction = prediction;
        this._state.status = 'success';
        this._state.lastUpdatedTimestamp = Date.now();
        this.saveAndNotify();
    }

    /** [Why/Intent] 停滞判定結果を更新して通知する */
    public setAssessment(assessment: StagnationAssessment): void {
        this._state.assessment = assessment;
        this.saveAndNotify();
    }

    /** [Why/Intent] 指定分数のスヌーズを設定し、停滞フラグを解除する */
    public snooze(minutes: number): void {
        this._state.snoozeUntilTimestamp = Date.now() + minutes * 60 * 1000;
        this._state.assessment = { ...this._state.assessment, isStagnated: false };
        this.saveAndNotify();
    }

    /** [Why/Intent] 今日は不要として通知を破棄し、停滞フラグを解除する */
    public dismiss(): void {
        this._state.isDismissed = true;
        this._state.assessment = { ...this._state.assessment, isStagnated: false };
        this.saveAndNotify();
    }

    /** [Why/Intent] ヒント開示モード（段階的 vs 一括）を切り替える */
    public setDisclosureMode(mode: 'stepByStep' | 'direct'): void {
        this._state.disclosureMode = mode;
        if (mode === 'direct') {
            this._state.unlockedLevel = 4;
        }
        this.saveAndNotify();
    }

    /** [Why/Intent] 次のヒントレベルを段階的にアンロックする（上限4） */
    public unlockNextLevel(): void {
        if (this._state.unlockedLevel < 4) {
            this._state.unlockedLevel = (this._state.unlockedLevel + 1) as 1 | 2 | 3 | 4;
            this.saveAndNotify();
        }
    }

    /** [Why/Intent] すべてのヒントレベルを一括アンロックする */
    public unlockAll(): void {
        this._state.unlockedLevel = 4;
        this.saveAndNotify();
    }

    /** [Why/Intent] エラー発生時の状態とメッセージを記録する */
    public setError(message: string, code?: LearningSessionState['errorCode']): void {
        this._state.status = 'error';
        this._state.errorMessage = message;
        this._state.errorCode = code ?? 'UNKNOWN';
        this.saveAndNotify();
    }

    /** [Why/Intent] 状態を永続化し、変更イベントを発火する */
    private saveAndNotify(): void {
        void this.memento?.update(LEARNING_CONFIG.STORAGE_KEY, this.getState());
        this._onDidChangeState.fire(this.getState());
    }

    /** [Why/Intent] イベントエミッターを解放する */
    public dispose(): void {
        this._onDidChangeState.dispose();
    }
}

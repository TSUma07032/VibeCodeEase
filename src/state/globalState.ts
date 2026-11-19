/**
 * [Why/Intent] 拡張機能全体のグローバル状態（介入モード、プリセット、ユーザー選好プロファイル、
 * LLMプロバイダ・モデル設定、AIペルソナ設定等）を一元管理するシングルトンストア。
 */
import * as vscode from 'vscode';
import { InterventionEngine } from '../core/interventionEngine';
import {
    DEFAULT_PRESET_MODE,
    DEFAULT_USER_PREFERENCES,
    type EditorAppealLevel,
    type InterventionLevel,
    type LlmConfig,
    type LlmProvider,
    type LlmTriggerMode,
    type PainCategory,
    PRESET_DEFINITIONS,
    type PresetMode,
    type UserPreferenceProfile,
} from '../types';
import type { PersonaId } from '../types/onDemandIntervention';

/**
 * [Why/Intent] VS CodeのglobalState / workspaceStateおよび設定と同期し、
 * 拡張機能の各サービスから参照される状態を提供するシングルトンクラス。
 */
export class GlobalState {
    private static instance: GlobalState;
    private context: vscode.ExtensionContext | undefined;
    private _mode: InterventionLevel = 'SUGGESTION';
    private _presetMode: PresetMode = DEFAULT_PRESET_MODE;
    private _preferences: UserPreferenceProfile = { ...DEFAULT_USER_PREFERENCES };
    private _llmProvider: LlmProvider = 'gemini';
    private _llmModel: string = 'gemini-3.5-flash-lite';
    private _llmTriggerMode: LlmTriggerMode = 'on-save';
    private _editorAppealLevel: EditorAppealLevel = 'medium';
    private _personaId: PersonaId = 'mentor';
    private _interventionLevelCache = new Map<PainCategory, InterventionLevel>();

    private readonly _onDidChangeState = new vscode.EventEmitter<void>();
    public readonly onDidChangeState = this._onDidChangeState.event;

    private constructor() {}

    /**
     * [Why/Intent] GlobalStateのシングルトンインスタンスを取得する。
     */
    public static getInstance(): GlobalState {
        if (!GlobalState.instance) {
            GlobalState.instance = new GlobalState();
        }
        return GlobalState.instance;
    }

    /**
     * [Why/Intent] テスト環境用: シングルトンインスタンスを初期状態にリセットする。
     */
    public static resetInstanceForTesting(): void {
        GlobalState.instance = new GlobalState();
    }

    /**
     * [Why/Intent] 拡張機能アクティベーション時にExtensionContextから永続化済み状態を復元する。
     */
    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        this._mode =
            context.globalState.get<InterventionLevel>('vibecodeease.mode') ?? 'SUGGESTION';
        this._presetMode =
            context.globalState.get<PresetMode>('vibecodeease.presetMode') ?? DEFAULT_PRESET_MODE;
        this._editorAppealLevel =
            context.globalState.get<EditorAppealLevel>('vibecodeease.editorAppealLevel') ??
            'medium';
        this._personaId =
            context.workspaceState.get<PersonaId>('vibecodeease.currentPersona') ??
            context.globalState.get<PersonaId>('vibecodeease.currentPersona') ??
            'mentor';

        this.initLlmConfig(context);
        this.initPreferences(context);
        this._interventionLevelCache.clear();
    }

    private initLlmConfig(context: vscode.ExtensionContext): void {
        const config = vscode.workspace.getConfiguration('vibecodeease');
        this._llmProvider =
            config.get<LlmProvider>('llmProvider') ??
            context.globalState.get<LlmProvider>('vibecodeease.llmProvider') ??
            'gemini';
        this._llmModel =
            config.get<string>('llmModel') ??
            context.globalState.get<string>('vibecodeease.llmModel') ??
            'gemini-3.5-flash-lite';
        this._llmTriggerMode =
            context.globalState.get<LlmTriggerMode>('vibecodeease.llmTriggerMode') ?? 'on-save';
    }

    private initPreferences(context: vscode.ExtensionContext): void {
        const storedPrefs = context.globalState.get<UserPreferenceProfile>(
            'vibecodeease.preferences',
        );
        if (storedPrefs?.preferences) {
            this._preferences = storedPrefs;
        } else if (this._presetMode !== 'CUSTOM') {
            this._preferences = {
                preferences: {
                    ...PRESET_DEFINITIONS[this._presetMode].preferences,
                },
            };
        }
    }

    /**
     * [Why/Intent] GlobalStateが初期化済みかどうかを返す。
     */
    public get isInitialized(): boolean {
        return this.context !== undefined;
    }

    /**
     * [Why/Intent] 互換性のための全体介入モードを取得する。
     * @deprecated 個別カテゴリごとの介入レベル（getInterventionLevel）または presetMode を使用してください。
     */
    public get mode(): InterventionLevel {
        return this._mode;
    }

    /**
     * [Why/Intent] 現在のプリセットモードを取得する。
     */
    public get presetMode(): PresetMode {
        return this._presetMode;
    }

    /**
     * [Why/Intent] 現在のユーザー選好プロファイルを取得する。
     */
    public get preferences(): UserPreferenceProfile {
        return this._preferences;
    }

    /**
     * [Why/Intent] 現在のLLMプロバイダ名を取得する。
     */
    public get llmProvider(): LlmProvider {
        return this._llmProvider;
    }

    /**
     * [Why/Intent] 現在のLLMモデル名を取得する。
     */
    public get llmModel(): string {
        return this._llmModel;
    }

    /**
     * [Why/Intent] 現在のLLM設定オブジェクトを取得する。
     */
    public get llmConfig(): LlmConfig {
        return {
            provider: this._llmProvider,
            model: this._llmModel,
        };
    }

    /**
     * [Why/Intent] 現在のLLMトリガーモードを取得する。
     */
    public get llmTriggerMode(): LlmTriggerMode {
        return this._llmTriggerMode;
    }

    /**
     * [Why/Intent] 現在のエディタアピールレベルを取得する。
     */
    public get editorAppealLevel(): EditorAppealLevel {
        return this._editorAppealLevel;
    }

    /**
     * [Why/Intent] 現在選択中のAIペルソナIDを取得する。
     */
    public get personaId(): PersonaId {
        return this._personaId;
    }

    /**
     * [Why/Intent] 全体介入モードを更新し永続化する。
     */
    public async setMode(mode: InterventionLevel): Promise<void> {
        this._mode = mode;
        if (this.context) {
            await this.context.globalState.update('vibecodeease.mode', mode);
        }
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] プリセットモードを更新し、対応する選好プロファイルを永続化する。
     */
    public async setPresetMode(preset: PresetMode): Promise<void> {
        this._presetMode = preset;
        if (preset !== 'CUSTOM') {
            const def = PRESET_DEFINITIONS[preset];
            this._preferences = {
                preferences: { ...def.preferences },
            };
        }
        if (this.context) {
            await this.context.globalState.update('vibecodeease.presetMode', preset);
            await this.context.globalState.update('vibecodeease.preferences', this._preferences);
        }
        this._interventionLevelCache.clear();
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] 特定カテゴリの選好度（0.0〜1.0）を更新し永続化する。
     */
    public async updatePreference(category: PainCategory, value: number): Promise<void> {
        this._preferences.preferences[category] = Math.max(0.0, Math.min(1.0, value));
        this._presetMode = 'CUSTOM';
        if (this.context) {
            await this.context.globalState.update('vibecodeease.presetMode', 'CUSTOM');
            await this.context.globalState.update('vibecodeease.preferences', this._preferences);
        }
        this._interventionLevelCache.clear();
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] 選好プロファイル全体とプリセットモードを一括更新し永続化する。
     */
    public async setFullPreferences(
        profile: UserPreferenceProfile,
        preset: PresetMode = 'CUSTOM',
    ): Promise<void> {
        this._preferences = profile;
        this._presetMode = preset;
        if (this.context) {
            await this.context.globalState.update('vibecodeease.presetMode', preset);
            await this.context.globalState.update('vibecodeease.preferences', this._preferences);
        }
        this._interventionLevelCache.clear();
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] LLMプロバイダおよびモデル設定を更新し、VS Code設定とglobalStateへ永続化する。
     */
    public async setLlmConfig(config: LlmConfig): Promise<void> {
        this._llmProvider = config.provider;
        this._llmModel = config.model;

        const workspaceConfig = vscode.workspace.getConfiguration('vibecodeease');
        await workspaceConfig.update(
            'llmProvider',
            config.provider,
            vscode.ConfigurationTarget.Global,
        );
        await workspaceConfig.update('llmModel', config.model, vscode.ConfigurationTarget.Global);

        if (this.context) {
            await this.context.globalState.update('vibecodeease.llmProvider', config.provider);
            await this.context.globalState.update('vibecodeease.llmModel', config.model);
        }
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] LLMトリガーモードを更新し永続化する。
     */
    public async setLlmTriggerMode(mode: LlmTriggerMode): Promise<void> {
        this._llmTriggerMode = mode;
        if (this.context) {
            await this.context.globalState.update('vibecodeease.llmTriggerMode', mode);
        }
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] エディタアピールレベルを更新し永続化する。
     */
    public async setEditorAppealLevel(level: EditorAppealLevel): Promise<void> {
        this._editorAppealLevel = level;
        if (this.context) {
            await this.context.globalState.update('vibecodeease.editorAppealLevel', level);
        }
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] 現在選択中のAIペルソナIDを更新し、workspaceStateおよびglobalStateへ永続化する。
     */
    public async setPersonaId(persona: PersonaId): Promise<void> {
        this._personaId = persona;
        if (this.context) {
            await this.context.workspaceState.update('vibecodeease.currentPersona', persona);
            await this.context.globalState.update('vibecodeease.currentPersona', persona);
        }
        this._onDidChangeState.fire();
    }

    /**
     * [Why/Intent] VS Code設定変更イベント時にLLMプロバイダ・モデル設定を再読み込みする。
     */
    public reloadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('vibecodeease');
        const newProvider = config.get<LlmProvider>('llmProvider');
        const newModel = config.get<string>('llmModel');

        let changed = false;
        if (newProvider && newProvider !== this._llmProvider) {
            this._llmProvider = newProvider;
            changed = true;
        }
        if (newModel && newModel !== this._llmModel) {
            this._llmModel = newModel;
            changed = true;
        }

        if (changed) {
            this._onDidChangeState.fire();
        }
    }

    /**
     * [Why/Intent] 特定のPainCategoryに対する現在の介入レベルを判定して返す。
     */
    public getInterventionLevel(category: PainCategory): InterventionLevel {
        // ⚡ Bolt: 介入レベル判定の高頻度な呼び出し結果をキャッシュし、計算コストを削減
        // Benchmark: ホバー時やCodeAction表示時に行われる O(N) 回のクランプ処理やオブジェクトアクセスを O(1) に最適化
        let level = this._interventionLevelCache.get(category);
        if (!level) {
            level = InterventionEngine.getLevelForCategory(category, this._preferences);
            this._interventionLevelCache.set(category, level);
        }
        return level;
    }
}

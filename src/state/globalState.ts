import * as vscode from 'vscode';
import {
    InterventionLevel,
    PainCategory,
    PresetMode,
    UserPreferenceProfile,
    PRESET_DEFINITIONS,
    DEFAULT_PRESET_MODE,
    DEFAULT_USER_PREFERENCES
} from '../types';
import { InterventionEngine } from '../core/interventionEngine';

export class GlobalState {
    private static instance: GlobalState;
    private context: vscode.ExtensionContext | undefined;
    private _mode: InterventionLevel = 'SUGGESTION';
    private _presetMode: PresetMode = DEFAULT_PRESET_MODE;
    private _preferences: UserPreferenceProfile = { ...DEFAULT_USER_PREFERENCES };

    private readonly _onDidChangeState = new vscode.EventEmitter<void>();
    public readonly onDidChangeState = this._onDidChangeState.event;

    private constructor() {}

    public static getInstance(): GlobalState {
        if (!GlobalState.instance) {
            GlobalState.instance = new GlobalState();
        }
        return GlobalState.instance;
    }

    public initialize(context: vscode.ExtensionContext) {
        this.context = context;
        this._mode = context.globalState.get<InterventionLevel>('vibecodeease.mode') || 'SUGGESTION';
        this._presetMode = context.globalState.get<PresetMode>('vibecodeease.presetMode') || DEFAULT_PRESET_MODE;
        const storedPrefs = context.globalState.get<UserPreferenceProfile>('vibecodeease.preferences');
        if (storedPrefs && storedPrefs.preferences) {
            this._preferences = storedPrefs;
        } else if (this._presetMode !== 'CUSTOM') {
            this._preferences = {
                preferences: { ...PRESET_DEFINITIONS[this._presetMode as Exclude<PresetMode, 'CUSTOM'>].preferences }
            };
        }
    }

    public get mode(): InterventionLevel {
        return this._mode;
    }

    public get presetMode(): PresetMode {
        return this._presetMode;
    }

    public get preferences(): UserPreferenceProfile {
        return this._preferences;
    }

    public async setMode(mode: InterventionLevel) {
        this._mode = mode;
        if (this.context) {
            await this.context.globalState.update('vibecodeease.mode', mode);
        }
        this._onDidChangeState.fire();
    }

    public async setPresetMode(preset: PresetMode) {
        this._presetMode = preset;
        if (preset !== 'CUSTOM') {
            const def = PRESET_DEFINITIONS[preset as Exclude<PresetMode, 'CUSTOM'>];
            this._preferences = {
                preferences: { ...def.preferences }
            };
        }
        if (this.context) {
            await this.context.globalState.update('vibecodeease.presetMode', preset);
            await this.context.globalState.update('vibecodeease.preferences', this._preferences);
        }
        this._onDidChangeState.fire();
    }

    public async updatePreference(category: PainCategory, value: number) {
        this._preferences.preferences[category] = Math.max(0.0, Math.min(1.0, value));
        this._presetMode = 'CUSTOM';
        if (this.context) {
            await this.context.globalState.update('vibecodeease.presetMode', 'CUSTOM');
            await this.context.globalState.update('vibecodeease.preferences', this._preferences);
        }
        this._onDidChangeState.fire();
    }

    public async setFullPreferences(profile: UserPreferenceProfile, preset: PresetMode = 'CUSTOM') {
        this._preferences = profile;
        this._presetMode = preset;
        if (this.context) {
            await this.context.globalState.update('vibecodeease.presetMode', preset);
            await this.context.globalState.update('vibecodeease.preferences', this._preferences);
        }
        this._onDidChangeState.fire();
    }

    /**
     * 特定のPainCategoryに対する現在の介入レベルを判定して返す
     */
    public getInterventionLevel(category: PainCategory): InterventionLevel {
        return InterventionEngine.getLevelForCategory(category, this._preferences);
    }
}

import * as vscode from 'vscode';
import { InterventionLevel } from '../types';

export class GlobalState {
    private static instance: GlobalState;
    private context: vscode.ExtensionContext | undefined;
    private _mode: InterventionLevel = 'SUGGESTION';

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
    }

    public get mode(): InterventionLevel {
        return this._mode;
    }

    public async setMode(mode: InterventionLevel) {
        this._mode = mode;
        if (this.context) {
            await this.context.globalState.update('vibecodeease.mode', mode);
        }
    }
}

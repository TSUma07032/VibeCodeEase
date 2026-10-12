import * as vscode from 'vscode';
import { SharedAnalysisCache } from '../core/analyzer';
import { InterventionManager } from '../core/interventionManager';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import { AnalysisResult } from '../types';
import type {
    AiInterventionLevel,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from '../types/webviewMessage';

// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Updated SideEditorProvider to sync dashboard states and LLM config seamlessly.
export class SideEditorProvider implements vscode.Disposable {
    private static instance: SideEditorProvider;
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    private _isApplyingIntervention = false;
    private _currentDocumentUri?: vscode.Uri;

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly llmService: LlmBackgroundService,
    ) {
        this.disposables.push(
            this.llmService.onDidUpdateDashboard.event((message) => {
                this.panel?.webview.postMessage(message);
            }),
        );
    }

    public static getInstance(
        context?: vscode.ExtensionContext,
        llmService?: LlmBackgroundService,
    ): SideEditorProvider {
        if (!SideEditorProvider.instance && context && llmService) {
            SideEditorProvider.instance = new SideEditorProvider(context, llmService);
        }
        return SideEditorProvider.instance;
    }

    public async openSideEditor() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vibecodeeaseSideEditor',
                'vibeCodeEase: AI Side Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist'),
                    ],
                },
            );

            this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

            this.panel.onDidDispose(
                () => {
                    this.dispose();
                },
                null,
                this.disposables,
            );

            this.panel.webview.onDidReceiveMessage(
                (message: WebviewToExtensionMessage) => {
                    this.handleMessage(message);
                },
                undefined,
                this.disposables,
            );

            this.registerListeners();

            await this.sendSettingsSync();
        }

        this.syncWithActiveEditor();
    }

    private registerListeners() {
        vscode.window.onDidChangeActiveTextEditor(
            (editor) => {
                if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
                    this._currentDocumentUri = editor.document.uri;
                    this.syncWithActiveEditor();
                }
            },
            null,
            this.disposables,
        );

        vscode.workspace.onDidChangeTextDocument(
            (event) => {
                if (this._isApplyingIntervention) {
                    return;
                }

                const document = event.document;
                if (
                    this._currentDocumentUri &&
                    document.uri.toString() === this._currentDocumentUri.toString()
                ) {
                    InterventionManager.handleDocumentChange(event);
                    this.sendUpdateInterventions(document);
                    this.sendSyncDocument(document.fileName, document.getText());
                }
            },
            null,
            this.disposables,
        );
    }

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Retrieve configuration for UI settings, using fallback logic for sync frequency.
    private async sendSettingsSync() {
        const apiKey = await this.context.secrets.get('vibecodeease.geminiApiKey');
        const config = vscode.workspace.getConfiguration('vibecodeease');
        const level = config.get<string>(
            'aiInterventionLevel',
            'Level 2 (Refactoring)',
        ) as AiInterventionLevel;

        let frequency = config.get<string>('llm.syncFrequency');
        if (!frequency) {
            frequency = config.get<boolean>('analyzeOnSave') ? 'onSave' : 'manual';
        }

        const intervalSeconds = config.get<number>('llm.syncIntervalSeconds') || 10;
        const model = config.get<string>('llmModel') || 'gemini-3.5-flash-lite';

        this.panel?.webview.postMessage({
            type: 'SYNC_SETTINGS',
            hasApiKey: Boolean(apiKey),
            apiKeyLength: apiKey ? apiKey.length : 0,
            interventionLevel: level,
            frequency: frequency as 'manual' | 'onSave' | 'interval',
            intervalSeconds: intervalSeconds,
            model: model,
        });
    }

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Handle incoming IPC messages including config updates and force analysis.
    private async handleMessage(message: WebviewToExtensionMessage) {
        if (message.command === 'ready') {
            if (this._currentDocumentUri) {
                const doc = vscode.workspace.textDocuments.find(
                    (d) => d.uri.toString() === this._currentDocumentUri!.toString(),
                );
                if (doc) {
                    this.sendSyncDocument(doc.fileName, doc.getText());
                    this.sendUpdateInterventions(doc);
                }
            }

            await this.sendSettingsSync();

            this.panel?.webview.postMessage({
                type: 'LLM_DASHBOARD_INIT',
                ...this.llmService.getDashboardState(),
            });
            return;
        }

        if (message.command === 'apply_intervention') {
            this._isApplyingIntervention = true;
            try {
                if (!this._currentDocumentUri) {return;}
                const doc = vscode.workspace.textDocuments.find(
                    (d) => d.uri.toString() === this._currentDocumentUri!.toString(),
                );
                if (!doc) {return;}

                const range = new vscode.Range(
                    new vscode.Position(message.range.start.line, message.range.start.character),
                    new vscode.Position(message.range.end.line, message.range.end.character),
                );

                await InterventionManager.applyIntervention(
                    doc,
                    message.id,
                    message.newText,
                    range,
                );

                this.sendUpdateInterventions(doc);
                this.sendSyncDocument(doc.fileName, doc.getText());
            } finally {
                this._isApplyingIntervention = false;
            }
        } else if (message.command === 'discard_intervention') {
            InterventionManager.discardIntervention(message.id);
            if (this._currentDocumentUri) {
                const doc = vscode.workspace.textDocuments.find(
                    (d) => d.uri.toString() === this._currentDocumentUri!.toString(),
                );
                if (doc) {
                    this.sendUpdateInterventions(doc);
                }
            }
        } else if (message.command === 'update_api_key') {
            if (message.apiKey) {
                await this.context.secrets.store('vibecodeease.geminiApiKey', message.apiKey);
            } else {
                await this.context.secrets.delete('vibecodeease.geminiApiKey');
            }
            await this.sendSettingsSync();
        } else if (message.command === 'update_intervention_level') {
            await vscode.workspace
                .getConfiguration('vibecodeease')
                .update('aiInterventionLevel', message.level, vscode.ConfigurationTarget.Global);
        } else if (message.command === 'update_llm_config') {
            let interval = Number(message.intervalSeconds);
            if (isNaN(interval) || interval < 5) {interval = 5;}
            if (interval > 3600) {interval = 3600;}

            const config = vscode.workspace.getConfiguration('vibecodeease');
            await config.update(
                'llm.syncFrequency',
                message.frequency,
                vscode.ConfigurationTarget.Global,
            );
            await config.update(
                'llm.syncIntervalSeconds',
                interval,
                vscode.ConfigurationTarget.Global,
            );
            await config.update('llmModel', message.model, vscode.ConfigurationTarget.Global);

            await this.sendSettingsSync();
            this.llmService.startTimerIfConfigured();
        } else if (message.command === 'clear_error_logs') {
            this.llmService.clearErrorLogs();
        } else if (message.command === 'force_analyze') {
            let targetDoc = vscode.workspace.textDocuments.find(
                (d) => d.uri.toString() === this._currentDocumentUri?.toString(),
            );
            if (!targetDoc) {
                targetDoc = vscode.window.visibleTextEditors.find(
                    (e) =>
                        e.document.uri.scheme === 'file' &&
                        e.viewColumn !== vscode.ViewColumn.Beside,
                )?.document;
            }
            if (targetDoc) {
                this.llmService.runAnalysis(targetDoc, false);
            }
        }
    }

    private syncWithActiveEditor() {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
            this._currentDocumentUri = editor.document.uri;
            this.sendSyncDocument(editor.document.fileName, editor.document.getText());
            this.sendUpdateInterventions(editor.document);
        }
    }

    private sendSyncDocument(fileName: string, text: string) {
        if (this.panel) {
            const message: ExtensionToWebviewMessage = {
                type: 'SYNC_DOCUMENT',
                fileName,
                text,
            };
            this.panel.webview.postMessage(message);
        }
    }

    public sendUpdateInterventions(document: vscode.TextDocument) {
        if (this.panel) {
            const results = SharedAnalysisCache.getInstance().getResults(document);
            const interventions = results.map((r) => {
                const id = InterventionManager.generateIssueId(document.uri.toString(), r);
                return {
                    id: id,
                    range: {
                        start: { line: r.range.start.line, character: r.range.start.character },
                        end: { line: r.range.end.line, character: r.range.end.character },
                    },
                    originalText: r.interventions[0]?.originalText || '',
                    replacementText: r.interventions[0]?.replacementText || '',
                    message: r.interventions[0]?.message || '',
                };
            });

            const message: ExtensionToWebviewMessage = {
                type: 'UPDATE_INTERVENTIONS',
                interventions,
            };
            this.panel.webview.postMessage(message);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'webview-ui',
                'dist',
                'assets',
                'index.js',
            ),
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'webview-ui',
                'dist',
                'assets',
                'index.css',
            ),
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>vibeCodeEase Side Editor</title>
            </head>
            <body>
                <div id="root"></div>
                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    public dispose() {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}

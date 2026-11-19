/**
 * [Why/Intent] 拡張機能内の全機能（コード推敲、学習支援、パーソナライズ、Embedding）が依存する統一LLMゲートウェイ。
 * プロバイダの差異を完全に隠蔽し、生レスポンスの完全出力（console.info）および構造化エラー制御を一元管理する。
 */
import type * as vscode from 'vscode';
import { GeminiClient } from './geminiClient';
import type { LlmConfigRepository } from './llmConfigRepository';
import { DEFAULT_EMBEDDING_MODEL, GEMINI_SUPPORTED_MODELS } from './llmConstants';
import { LlmError } from './llmErrors';
import { VscodeLmClient } from './vscodeLmClient';

/**
 * [Why/Intent] LLM通信直後の加工前生テキストとパース済みオブジェクトを束ねる内部型
 */
export interface RawLlmResponse<T = unknown> {
    /** [Why/Intent] LLMから受信した生のレスポンス文字列（未加工・未省略） */
    rawText: string;
    /** [Why/Intent] JSONパースおよび検証済みの結果オブジェクト */
    parsed: T;
}

/**
 * [Why/Intent] 構造化出力生成オプション。
 * 単一プロンプト (prompt) または System/User 分離プロンプトの双方に対応する。
 */
export interface GenerateStructuredOptions<T = unknown> {
    /** [Why/Intent] 単一プロンプト文字列（指定時はsystemInstruction/userPromptより優先） */
    prompt?: string;
    /** [Why/Intent] モデルの役割・振る舞いを指定するシステム指示文 */
    systemInstruction?: string;
    /** [Why/Intent] ユーザー入力プロンプト */
    userPrompt?: string;
    /** [Why/Intent] レスポンスのJSONスキーマ定義 */
    responseSchema: unknown;
    /** [Why/Intent] 処理中断を受け付けるキャンセレーショントークン */
    token: vscode.CancellationToken;
    /** [Why/Intent] 使用するモデル名（省略時は設定ストアから解決） */
    modelName?: string;
    /** [Why/Intent] レスポンスオブジェクトの型検証・変換関数（オプション） */
    responseValidator?: (data: unknown) => T;
}

/**
 * [Why/Intent] 複数テキストのバッチEmbedding生成オプション
 */
export interface EmbedBatchOptions {
    /** [Why/Intent] ベクトル化対象のテキスト配列 */
    texts: string[];
    /** [Why/Intent] キャンセレーショントークン */
    token: vscode.CancellationToken;
    /** [Why/Intent] 埋め込みモデル名（省略時はデフォルト） */
    modelName?: string;
}

/**
 * [Why/Intent] 全てのLLM通信処理が準拠する統一ゲートウェイインターフェース
 */
export interface ILlmGateway {
    /** [Why/Intent] 構造化スキーマを指定してLLM推論を実行し、型安全なオブジェクトを返却する */
    generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T>;
    /** [Why/Intent] テキストリストを一括してベクトル埋め込みに変換する */
    embedBatch(options: EmbedBatchOptions): Promise<number[][]>;
    /** [Why/Intent] サポートされているモデル名一覧を取得する */
    getAvailableModels(): Promise<string[]>;
}

/** [Why/Intent] dispatchGeneration メソッドの引数オブジェクト型（RULE-003 Optionsパターン） */
interface DispatchGenerationParams<T> {
    provider: string;
    model: string;
    fullPrompt: string;
    options: GenerateStructuredOptions<T>;
}

/**
 * [Why/Intent] LlmGatewayコンストラクタのオプショナル依存関係（RULE-003 Optionsパターン、引数過多抑制）
 */
export interface LlmGatewayDependencies {
    geminiClient?: GeminiClient;
    vscodeLmClient?: VscodeLmClient;
    logger?: (...args: unknown[]) => void;
}

/**
 * [Why/Intent] 統一LLMゲートウェイの実装クラス。
 * プロバイダ分岐のカプセル化、APIキー取得、生返答のconsole.info出力、エラーハンドリングを統括する。
 */
export class LlmGateway implements ILlmGateway {
    private readonly geminiClient: GeminiClient;
    private readonly vscodeLmClient: VscodeLmClient;
    private readonly logger: (...args: unknown[]) => void;

    /**
     * [Why/Intent] デフォルトインスタンスをOptionsパターンで保持することで、
     * 外部での直接インスタンス化を不要とし境界テスト適合とDIを両立する（max-params抑制）。
     */
    constructor(
        private readonly configRepo: LlmConfigRepository,
        deps: LlmGatewayDependencies = {},
    ) {
        this.geminiClient = deps.geminiClient ?? new GeminiClient();
        this.vscodeLmClient = deps.vscodeLmClient ?? new VscodeLmClient();
        this.logger = deps.logger ?? console.info;
    }

    /**
     * [Why/Intent] プロバイダに応じた低レベルクライアントへのディスパッチヘルパー（文数・複雑度抑制）
     */
    private async dispatchGeneration<T>(
        params: DispatchGenerationParams<T>,
    ): Promise<RawLlmResponse<T>> {
        const { provider, model, fullPrompt, options } = params;
        if (provider === 'gemini') {
            const apiKey = await this.configRepo.getApiKey();
            if (!apiKey) {
                throw new LlmError({
                    code: 'AUTH_MISSING',
                    message: 'Gemini APIキーが設定されていません。',
                });
            }
            return this.geminiClient.generateContentWithRaw<T>({
                prompt: fullPrompt,
                apiKey,
                token: options.token,
                modelName: model,
                responseSchema: options.responseSchema,
            });
        }
        return this.vscodeLmClient.generateWithRaw<T>(fullPrompt, options.token, model);
    }

    /**
     * [Why/Intent] プロバイダ（gemini/vscode-lm）を自動選択して構造化出力を取得し、生テキストを丸ごとconsole.info出力する。
     * （※ESLintのno-consoleルールに従い、console.logではなくconsole.infoを用いて出力する）
     */
    public async generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
        const config = this.configRepo.getLlmConfig();
        const model = options.modelName ?? config.model;
        const fullPrompt =
            options.prompt ??
            `${options.systemInstruction ?? ''}\n\n${options.userPrompt ?? ''}`.trim();
        const startTime = Date.now();

        const res = await this.dispatchGeneration<T>({
            provider: config.provider,
            model,
            fullPrompt,
            options,
        });
        const latencyMs = Date.now() - startTime;

        // ★【要件F: 生返答を加工・切り詰めなしで丸ごとconsole.info出力】
        this.logger(
            `[LLM Raw Response] [${config.provider}] [${model}] (Latency: ${latencyMs}ms):\n`,
            res.rawText,
        );
        this.logger(`[LLM Parsed Object] [${config.provider}] [${model}]:\n`, res.parsed);

        if (options.responseValidator) {
            return options.responseValidator(res.parsed);
        }
        return res.parsed;
    }

    /**
     * [Why/Intent] テキストのバッチベクトル埋め込みを実行する。
     */
    public async embedBatch(options: EmbedBatchOptions): Promise<number[][]> {
        const apiKey = await this.configRepo.getApiKey();
        if (!apiKey) {
            throw new LlmError({
                code: 'AUTH_MISSING',
                message: 'Embedding用Gemini APIキーがありません。',
            });
        }
        return this.geminiClient.embedBatch({
            texts: options.texts,
            apiKey,
            token: options.token,
            modelName: options.modelName ?? DEFAULT_EMBEDDING_MODEL,
        });
    }

    /**
     * [Why/Intent] サポートされるGeminiモデル名一覧を取得する。
     */
    public getAvailableModels(): Promise<string[]> {
        return Promise.resolve([...GEMINI_SUPPORTED_MODELS]);
    }
}

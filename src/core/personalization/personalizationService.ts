import * as vscode from 'vscode';
import { GlobalState } from '../../state/globalState';
import type {
    PersonalizationProfile,
    PersonaMode,
    PzMetrics,
    ResponseRecord,
    SituationId,
} from '../../types/personalization';
import type { GeminiClient } from '../llm/geminiClient';
import type { VscodeLmClient } from '../llm/vscodeLmClient';
import { CandidateGenerator } from './candidateGenerator';
import type { EmbeddingProvider } from './embedding/embeddingProvider';
import { GeminiEmbeddingProvider } from './embedding/geminiEmbeddingProvider';
import { LocalHashEmbeddingProvider } from './embedding/localHashEmbeddingProvider';
import { PreferenceStore } from './preferenceStore';
import { PreferenceSummarizer } from './preferenceSummarizer';
import { DEFAULT_RERANKING_CONFIG, rerankCandidates, type ScoredCandidate } from './reranker';
import { determinePersonaWeights } from './situationPersonaSelector';

/**
 * [Why/Intent] PersonalizationService の初期化に必要なストレージURIおよびLLM通信クライアント群
 */
export interface PersonalizationServiceParams {
    globalStorageUri: vscode.Uri;
    geminiClient: GeminiClient;
    vscodeLmClient: VscodeLmClient;
    getApiKey: () => Promise<string | undefined>;
}

export class PersonalizationService {
    private store: PreferenceStore;
    private generator: CandidateGenerator;
    private summarizer: PreferenceSummarizer;
    private proxyProvider: ProxyEmbeddingProvider;

    private metrics: PzMetrics = {
        totalInteractions: 0,
        preferenceHits: 0,
        acceptedCount: 0,
        regenerationCount: 0,
    };

    // To track the current interaction state
    private currentCandidates: ScoredCandidate[] = [];
    private currentSituation: SituationId = 'learning';

    constructor(params: PersonalizationServiceParams) {
        const getLlmConfig = () => GlobalState.getInstance().llmConfig;

        this.proxyProvider = new ProxyEmbeddingProvider(params.geminiClient, params.getApiKey);

        this.store = new PreferenceStore(params.globalStorageUri, this.proxyProvider);
        this.generator = new CandidateGenerator({
            geminiClient: params.geminiClient,
            vscodeLmClient: params.vscodeLmClient,
            getLlmConfig,
            getApiKey: params.getApiKey,
        });
        this.summarizer = new PreferenceSummarizer({
            geminiClient: params.geminiClient,
            vscodeLmClient: params.vscodeLmClient,
            getLlmConfig,
            getApiKey: params.getApiKey,
        });
    }

    public async initialize(): Promise<void> {
        await this.proxyProvider.refreshProviderId();
        await this.store.load();
        this.currentSituation = this.store.getProfile().currentSituation || 'learning';
    }

    public getProfile(): PersonalizationProfile {
        return this.store.getProfile();
    }

    public getMetrics(): PzMetrics {
        return this.metrics;
    }

    public async setSituation(situation: SituationId): Promise<void> {
        this.currentSituation = situation;
        const profile = this.store.getProfile();
        profile.currentSituation = situation;
        await this.store.save();
    }

    public async setPersonaMode(mode: PersonaMode): Promise<void> {
        const profile = this.store.getProfile();
        profile.currentPersonaMode = mode;
        await this.store.save();
    }

    public async setVisibilityLevel(level: 'stealth' | 'subtle' | 'active'): Promise<void> {
        const profile = this.store.getProfile();
        profile.visibilityLevel = level;
        await this.store.save();
    }

    public async setExplanationVerbosity(level: 'minimal' | 'summary' | 'detailed'): Promise<void> {
        const profile = this.store.getProfile();
        profile.explanationVerbosity = level;
        await this.store.save();
    }

    public async setApplicationAutomation(level: 'manual' | 'bulk' | 'auto'): Promise<void> {
        const profile = this.store.getProfile();
        profile.applicationAutomation = level;
        await this.store.save();
    }

    public async ask(
        query: string,
        contextCode: string | undefined,
        token: vscode.CancellationToken,
    ): Promise<ScoredCandidate[]> {
        const profile = this.store.getProfile();

        // 1. Determine weights using both liked and disliked records
        const { weights } = determinePersonaWeights({
            situation: this.currentSituation,
            mode: profile.currentPersonaMode,
            records: [...profile.likedRecords, ...profile.dislikedRecords],
        });

        // 2. Generate candidates
        const candidates = await this.generator.generateCandidates({
            userQuery: query,
            contextCode,
            situation: this.currentSituation,
            personaWeights: weights,
            preferenceSummary: profile.preferenceSummary,
            token,
        });

        // 3. Embed candidates
        const texts = candidates.map((c) => c.text);
        const embeddings = await this.store.embeddingProvider.embedBatch(texts);
        for (let i = 0; i < candidates.length; i++) {
            candidates[i].embedding = embeddings[i];
        }

        // 4. Rerank
        const scored = rerankCandidates({
            candidates,
            positiveProfile: profile.positiveProfile,
            negativeProfile: profile.negativeProfile,
            recentProfile: profile.recentPreferences,
            personaWeights: weights,
            config: DEFAULT_RERANKING_CONFIG,
        });

        this.currentCandidates = scored;
        return scored;
    }

    private recordCandidateFeedback(
        candidateId: string,
        action: 'accept' | 'good' | 'bad' | 'regenerate',
    ): void {
        if (action === 'regenerate') {
            this.metrics.regenerationCount++;
            if (this.currentCandidates.length > 0) {
                this.addRecord(this.currentCandidates[0], 'disliked');
            }
            return;
        }
        const candidate = this.currentCandidates.find((c) => c.id === candidateId);
        if (!candidate) {
            return;
        }
        this.metrics.totalInteractions++;
        if (action === 'accept') {
            this.metrics.acceptedCount++;
            if (this.currentCandidates[0]?.id === candidateId) {
                this.metrics.preferenceHits++;
            }
            this.addRecord(candidate, 'liked');
        } else if (action === 'good') {
            this.addRecord(candidate, 'liked');
        } else {
            this.addRecord(candidate, 'disliked');
        }
    }

    public async provideFeedback(
        candidateId: string,
        action: 'accept' | 'good' | 'bad' | 'regenerate',
    ): Promise<void> {
        this.recordCandidateFeedback(candidateId, action);

        if (this.metrics.totalInteractions > 0 && this.metrics.totalInteractions % 5 === 0) {
            const cts = new vscode.CancellationTokenSource();
            try {
                await this.updateSummaries(cts.token);
            } catch (e) {
                console.error(e);
            } finally {
                cts.dispose();
            }
        }

        await this.store.save();
    }

    private addRecord(candidate: ScoredCandidate, feedback: 'liked' | 'disliked'): void {
        const profile = this.store.getProfile();
        const record: ResponseRecord = {
            id: `${Date.now().toString()}_${candidate.id}`,
            text: candidate.text,
            embedding: candidate.embedding ?? [],
            feedback,
            persona: candidate.persona,
            situation: this.currentSituation,
            createdAt: Date.now(),
            providerId: this.store.embeddingProvider.providerId,
        };

        if (feedback === 'liked') {
            profile.likedRecords.push(record);
        } else {
            profile.dislikedRecords.push(record);
        }

        this.store.enforceLimits();
    }

    public async updateSummaries(token: vscode.CancellationToken): Promise<void> {
        const profile = this.store.getProfile();
        const { personaSummary, preferenceSummary } = await this.summarizer.summarize(
            profile.likedRecords,
            profile.dislikedRecords,
            token,
        );
        profile.personaSummary = personaSummary;
        profile.preferenceSummary = preferenceSummary;
        await this.store.save();
    }

    public async reset(): Promise<void> {
        await this.store.reset();
        this.metrics = {
            totalInteractions: 0,
            preferenceHits: 0,
            acceptedCount: 0,
            regenerationCount: 0,
        };
        this.currentCandidates = [];
    }
}

/**
 * Proxy that tries Gemini embedding, falls back to Local Hash if no API key
 */
class ProxyEmbeddingProvider implements EmbeddingProvider {
    private readonly gemini: GeminiEmbeddingProvider;
    private readonly local: LocalHashEmbeddingProvider;
    private _activeProviderId = 'proxy-auto';

    constructor(
        geminiClient: GeminiClient,
        private readonly getApiKey: () => Promise<string | undefined>,
    ) {
        this.gemini = new GeminiEmbeddingProvider(geminiClient, getApiKey);
        this.local = new LocalHashEmbeddingProvider();
    }

    public get providerId(): string {
        return this._activeProviderId;
    }

    public async refreshProviderId(): Promise<string> {
        const apiKey = await this.getApiKey();
        this._activeProviderId = apiKey ? this.gemini.providerId : this.local.providerId;
        return this._activeProviderId;
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const apiKey = await this.getApiKey();
        if (apiKey) {
            this._activeProviderId = this.gemini.providerId;
            return this.gemini.embedBatch(texts);
        }
        this._activeProviderId = this.local.providerId;
        return this.local.embedBatch(texts);
    }
}

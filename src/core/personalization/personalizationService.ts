import * as vscode from 'vscode';
import { 
    PersonaId, 
    PersonaMode, 
    SituationId, 
    Candidate, 
    ResponseRecord, 
    PersonalizationProfile,
    PzMetrics 
} from '../../types/personalization';
import { PreferenceStore } from './preferenceStore';
import { CandidateGenerator } from './candidateGenerator';
import { PreferenceSummarizer } from './preferenceSummarizer';
import { GeminiEmbeddingProvider } from './embedding/geminiEmbeddingProvider';
import { LocalHashEmbeddingProvider } from './embedding/localHashEmbeddingProvider';
import { EmbeddingProvider } from './embedding/embeddingProvider';
import { determinePersonaWeights } from './situationPersonaSelector';
import { rerankCandidates, ScoredCandidate, DEFAULT_RERANKING_CONFIG } from './reranker';
import { GeminiClient } from '../llm/geminiClient';
import { VscodeLmClient } from '../llm/vscodeLmClient';
import { GlobalState } from '../../state/globalState';

export class PersonalizationService {
    private store: PreferenceStore;
    private generator: CandidateGenerator;
    private summarizer: PreferenceSummarizer;
    
    private metrics: PzMetrics = {
        totalInteractions: 0,
        preferenceHits: 0,
        acceptedCount: 0,
        regenerationCount: 0
    };

    // To track the current interaction state
    private currentCandidates: ScoredCandidate[] = [];
    private currentSituation: SituationId = 'learning';

    constructor(
        globalStorageUri: vscode.Uri,
        private readonly geminiClient: GeminiClient,
        private readonly vscodeLmClient: VscodeLmClient,
        private readonly getApiKey: () => Promise<string | undefined>
    ) {
        const getLlmConfig = () => GlobalState.getInstance().llmConfig;

        // Try Gemini Embedding first, fallback to Local Hash later if key is missing when embedding
        // We will initialize GeminiProvider. If it fails due to no key during embedBatch, 
        // we might switch, but for simplicity, we pass a composite or just Local Hash if no key initially.
        // Let's create a proxy provider that falls back automatically.
        const provider = new ProxyEmbeddingProvider(geminiClient, getApiKey);

        this.store = new PreferenceStore(globalStorageUri, provider);
        this.generator = new CandidateGenerator(geminiClient, vscodeLmClient, getLlmConfig, getApiKey);
        this.summarizer = new PreferenceSummarizer(geminiClient, vscodeLmClient, getLlmConfig, getApiKey);
    }

    public async initialize(): Promise<void> {
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

    public async ask(query: string, contextCode: string | undefined, token: vscode.CancellationToken): Promise<ScoredCandidate[]> {
        const profile = this.store.getProfile();
        
        // 1. Determine weights
        const { weights } = determinePersonaWeights(
            this.currentSituation,
            profile.currentPersonaMode,
            profile.likedRecords
        );

        // 2. Generate candidates
        const candidates = await this.generator.generateCandidates(
            query,
            contextCode,
            this.currentSituation,
            weights,
            profile.preferenceSummary,
            token
        );

        // 3. Embed candidates
        const texts = candidates.map(c => c.text);
        const embeddings = await (this.store as any).embeddingProvider.embedBatch(texts);
        for (let i = 0; i < candidates.length; i++) {
            candidates[i].embedding = embeddings[i];
        }

        // 4. Rerank
        const scored = rerankCandidates(
            candidates,
            profile.positiveProfile,
            profile.negativeProfile,
            profile.recentPreferences,
            weights,
            DEFAULT_RERANKING_CONFIG
        );

        this.currentCandidates = scored;
        return scored;
    }

    public async provideFeedback(candidateId: string, action: 'accept' | 'good' | 'bad' | 'regenerate'): Promise<void> {
        const profile = this.store.getProfile();
        const candidate = this.currentCandidates.find(c => c.id === candidateId);
        
        if (action === 'regenerate') {
            this.metrics.regenerationCount++;
            // Treat top candidate as weak negative if they hit regenerate
            if (this.currentCandidates.length > 0) {
                const top = this.currentCandidates[0];
                this.addRecord(top, 'disliked');
            }
        } else if (candidate) {
            this.metrics.totalInteractions++;
            if (action === 'accept') {
                this.metrics.acceptedCount++;
                if (this.currentCandidates[0].id === candidateId) {
                    this.metrics.preferenceHits++;
                }
                this.addRecord(candidate, 'liked');
            } else if (action === 'good') {
                this.addRecord(candidate, 'liked');
            } else if (action === 'bad') {
                this.addRecord(candidate, 'disliked');
            }
        }

        // Auto-summarize every 5 interactions
        if (this.metrics.totalInteractions > 0 && this.metrics.totalInteractions % 5 === 0) {
            await this.updateSummaries(new vscode.CancellationTokenSource().token).catch(e => console.error(e));
        }

        await this.store.save();
    }

    private addRecord(candidate: ScoredCandidate, feedback: 'liked' | 'disliked'): void {
        const profile = this.store.getProfile();
        const record: ResponseRecord = {
            id: Date.now().toString() + '_' + candidate.id,
            text: candidate.text,
            embedding: candidate.embedding!,
            feedback,
            persona: candidate.persona,
            situation: this.currentSituation,
            createdAt: Date.now(),
            providerId: (this.store as any).embeddingProvider.providerId
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
            token
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
            regenerationCount: 0
        };
        this.currentCandidates = [];
    }
}

/**
 * Proxy that tries Gemini embedding, falls back to Local Hash if no API key
 */
class ProxyEmbeddingProvider implements EmbeddingProvider {
    private gemini: GeminiEmbeddingProvider;
    private local: LocalHashEmbeddingProvider;

    constructor(
        geminiClient: GeminiClient,
        private readonly getApiKey: () => Promise<string | undefined>
    ) {
        this.gemini = new GeminiEmbeddingProvider(geminiClient, getApiKey);
        this.local = new LocalHashEmbeddingProvider();
    }

    public get providerId(): string {
        return 'proxy-auto'; // The actual records will save the concrete provider ID
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const apiKey = await this.getApiKey();
        if (apiKey) {
            // Re-assign providerId so records know what generated it
            Object.defineProperty(this, 'providerId', { value: this.gemini.providerId, configurable: true });
            return this.gemini.embedBatch(texts);
        } else {
            Object.defineProperty(this, 'providerId', { value: this.local.providerId, configurable: true });
            return this.local.embedBatch(texts);
        }
    }
}

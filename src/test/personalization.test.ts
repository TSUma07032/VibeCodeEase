import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GeminiClient } from '../core/llm/geminiClient';
import type { VscodeLmClient } from '../core/llm/vscodeLmClient';
import { GeminiEmbeddingProvider } from '../core/personalization/embedding/geminiEmbeddingProvider';
import { LocalHashEmbeddingProvider } from '../core/personalization/embedding/localHashEmbeddingProvider';
import { PersonalizationService } from '../core/personalization/personalizationService';
import { PreferenceStore } from '../core/personalization/preferenceStore';
import { rerankCandidates } from '../core/personalization/reranker';
import { determinePersonaWeights } from '../core/personalization/situationPersonaSelector';
import { cosineSimilarity, meanVector, normalizeInPlace } from '../core/personalization/vectorMath';
import type { Candidate, ResponseRecord } from '../types/personalization';

function registerVectorAndRankingTests(): void {
    test('vectorMath (cosineSimilarity / normalizeInPlace / meanVector) が正確に計算されること', () => {
        assert.strictEqual(cosineSimilarity([1, 0], [1, 0]), 1);
        assert.strictEqual(cosineSimilarity([1, 0], [0, 1]), 0);
        assert.strictEqual(cosineSimilarity([1, 2], [1]), 0);
        assert.strictEqual(cosineSimilarity([0, 0], [0, 0]), 0);

        const vec = [3, 4];
        normalizeInPlace(vec);
        assert.ok(Math.abs(vec[0] - 0.6) < 1e-6);
        assert.ok(Math.abs(vec[1] - 0.8) < 1e-6);

        const mean = meanVector([
            [1, 0],
            [0, 1],
        ]);
        assert.deepStrictEqual(mean, [0.5, 0.5]);
        assert.throws(() => meanVector([[1, 0], [1]]), /same dimension/);
    });

    test('determinePersonaWeights と rerankCandidates が嗜好重心に基づき再ランキングすること', () => {
        const records: ResponseRecord[] = [
            {
                id: 'r-1',
                text: 'liked answer',
                embedding: [1, 0],
                feedback: 'liked',
                persona: 'learning',
                situation: 'learning',
                createdAt: Date.now(),
                providerId: 'local:hash-ngram-512',
            },
            {
                id: 'r-2',
                text: 'disliked answer',
                embedding: [0, 1],
                feedback: 'disliked',
                persona: 'exploration',
                situation: 'learning',
                createdAt: Date.now(),
                providerId: 'local:hash-ngram-512',
            },
        ];

        const fixed = determinePersonaWeights({
            situation: 'learning',
            mode: 'fixed:quality',
            records,
        });
        assert.strictEqual(fixed.dominantPersona, 'quality');
        assert.strictEqual(fixed.weights.quality, 1);

        const adaptive = determinePersonaWeights({
            situation: 'learning',
            mode: 'adaptive',
            records,
        });
        assert.strictEqual(adaptive.dominantPersona, 'learning');

        const candidates: Candidate[] = [
            {
                id: 'c-disliked',
                persona: 'exploration',
                text: 'bad',
                embedding: [0, 1],
                policyCompliant: true,
            },
            {
                id: 'c-liked',
                persona: 'learning',
                text: 'good',
                embedding: [1, 0],
                policyCompliant: true,
            },
        ];
        const ranked = rerankCandidates({
            candidates,
            positiveProfile: [1, 0],
            negativeProfile: [0, 1],
            recentProfile: [1, 0],
            personaWeights: adaptive.weights,
        });
        assert.strictEqual(ranked[0].id, 'c-liked');
        assert.ok(ranked[0].score > ranked[1].score);
    });
}

function registerEmbeddingAndStoreTests(): void {
    test('LocalHashEmbeddingProvider と GeminiEmbeddingProvider(gemini-embedding-001) が動作すること', async () => {
        const local = new LocalHashEmbeddingProvider();
        const vecs = await local.embedBatch(['const userCount = 10;', '']);
        assert.strictEqual(vecs.length, 2);
        assert.strictEqual(vecs[0].length, 512);

        const mockGemini = {
            embedBatch: (opts: { modelName?: string }) =>
                Promise.resolve([opts.modelName === 'gemini-embedding-001' ? [1, 0] : [0, 0]]),
        } as unknown as GeminiClient;
        const gemini = new GeminiEmbeddingProvider(mockGemini, () => Promise.resolve('key-1'));
        assert.strictEqual(gemini.providerId, 'gemini:gemini-embedding-001');
        const gVecs = await gemini.embedBatch(['hello']);
        assert.deepStrictEqual(gVecs, [[1, 0]]);
    });

    test('PreferenceStore が異なる次元のベクトル混在時も例外なく重心を計算し永続化すること', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-pref-'));
        const local = new LocalHashEmbeddingProvider();
        const store = new PreferenceStore(vscode.Uri.file(tmpDir), local);
        await store.load();

        const profile = store.getProfile();
        profile.likedRecords.push(
            {
                id: '1',
                text: 'old dim',
                embedding: [1, 0, 0],
                feedback: 'liked',
                persona: 'learning',
                situation: 'learning',
                createdAt: 100,
                providerId: local.providerId,
            },
            {
                id: '2',
                text: 'new dim',
                embedding: [1, 0],
                feedback: 'liked',
                persona: 'learning',
                situation: 'learning',
                createdAt: 200,
                providerId: local.providerId,
            },
        );
        await store.save();
        assert.deepStrictEqual(store.getProfile().positiveProfile, [1, 0]);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('PersonalizationService が初期化・ask・provideFeedback・reset を実行できること', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-svc-'));
        const mockGemini = {
            generate: () =>
                Promise.resolve([
                    { id: 'c1', persona: 'learning', text: 'Answer 1', policyCompliant: true },
                    { id: 'c2', persona: 'quality', text: 'Answer 2', policyCompliant: true },
                ]),
            embedBatch: ({ texts }: { texts: string[] }) =>
                Promise.resolve(texts.map(() => [1, 0])),
        } as unknown as GeminiClient;
        const mockLm = {} as unknown as VscodeLmClient;

        const service = new PersonalizationService({
            globalStorageUri: vscode.Uri.file(tmpDir),
            geminiClient: mockGemini,
            vscodeLmClient: mockLm,
            getApiKey: () => Promise.resolve('test-key'),
        });
        await service.initialize();
        await service.setSituation('implementation');
        await service.setApplicationAutomation('auto');
        assert.strictEqual(service.getProfile().applicationAutomation, 'auto');

        const cts = new vscode.CancellationTokenSource();
        const ranked = await service.ask('How to refactor?', 'const a = 1;', cts.token);
        assert.strictEqual(ranked.length, 2);

        await service.provideFeedback('c1', 'accept');
        assert.strictEqual(service.getMetrics().acceptedCount, 1);

        await service.reset();
        assert.strictEqual(service.getMetrics().totalInteractions, 0);
        cts.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
}

suite('Personalization Engine Test Suite', () => {
    registerVectorAndRankingTests();
    registerEmbeddingAndStoreTests();
});

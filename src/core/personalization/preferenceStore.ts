import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { PersonalizationProfile } from '../../types/personalization';
import type { EmbeddingProvider } from './embedding/embeddingProvider';
import { meanVector } from './vectorMath';

function filterConsistentVectors(vectors: Array<number[] | undefined>): number[][] {
    const nonEmpty = vectors.filter((v): v is number[] => Array.isArray(v) && v.length > 0);
    if (nonEmpty.length === 0) {
        return [];
    }
    const targetDim = nonEmpty[nonEmpty.length - 1].length;
    return nonEmpty.filter((v) => v.length === targetDim);
}

export class PreferenceStore {
    private readonly filePath: string;
    private profile: PersonalizationProfile;

    // Limits
    private readonly MAX_LIKED = 200;
    private readonly MAX_DISLIKED = 200;
    private readonly MAX_RECENT = 5;

    constructor(
        globalStorageUri: vscode.Uri,
        public readonly embeddingProvider: EmbeddingProvider,
        private readonly userId: string = 'local',
    ) {
        if (!fs.existsSync(globalStorageUri.fsPath)) {
            fs.mkdirSync(globalStorageUri.fsPath, { recursive: true });
        }
        this.filePath = path.join(globalStorageUri.fsPath, 'personalization.json');

        this.profile = this.getEmptyProfile();
    }

    private getEmptyProfile(): PersonalizationProfile {
        return {
            userId: this.userId,
            likedRecords: [],
            dislikedRecords: [],
            preferenceSummary: '',
            currentPersonaMode: 'adaptive',
            currentSituation: 'learning',
            personaSummary: '',
            visibilityLevel: 'subtle',
            explanationVerbosity: 'summary',
            applicationAutomation: 'manual',
        };
    }

    public async load(): Promise<PersonalizationProfile> {
        if (!fs.existsSync(this.filePath)) {
            return this.profile;
        }

        try {
            const raw = await fs.promises.readFile(this.filePath, 'utf-8');
            const data = JSON.parse(raw) as PersonalizationProfile;

            // Check if provider changed
            let needsReEmbed = false;
            const currentProviderId = this.embeddingProvider.providerId;
            if (currentProviderId && currentProviderId !== 'proxy-auto') {
                if (
                    data.likedRecords.length > 0 &&
                    data.likedRecords[0].providerId !== currentProviderId
                ) {
                    needsReEmbed = true;
                } else if (
                    data.dislikedRecords.length > 0 &&
                    data.dislikedRecords[0].providerId !== currentProviderId
                ) {
                    needsReEmbed = true;
                }
            }

            this.profile = data;

            if (needsReEmbed) {
                await this.recalculateEmbeddings();
            }

            return this.profile;
        } catch (e) {
            console.error('Failed to load personalization profile', e);
            return this.profile;
        }
    }

    public getProfile(): PersonalizationProfile {
        return this.profile;
    }

    public async save(): Promise<void> {
        this.updateCentroids();
        try {
            await fs.promises.writeFile(
                this.filePath,
                JSON.stringify(this.profile, null, 2),
                'utf-8',
            );
        } catch (e) {
            console.error('Failed to save personalization profile', e);
        }
    }

    public async reset(): Promise<void> {
        this.profile = this.getEmptyProfile();
        await this.save();
    }

    private updateCentroids(): void {
        const p = this.profile;

        const likedVecs = filterConsistentVectors(p.likedRecords.map((r) => r.embedding));
        p.positiveProfile = likedVecs.length > 0 ? meanVector(likedVecs) : undefined;

        const dislikedVecs = filterConsistentVectors(p.dislikedRecords.map((r) => r.embedding));
        p.negativeProfile = dislikedVecs.length > 0 ? meanVector(dislikedVecs) : undefined;

        const recentVecs = filterConsistentVectors(
            [...p.likedRecords]
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, this.MAX_RECENT)
                .map((r) => r.embedding),
        );

        p.recentPreferences = recentVecs.length > 0 ? meanVector(recentVecs) : undefined;
    }

    public enforceLimits(): void {
        const p = this.profile;
        if (p.likedRecords.length > this.MAX_LIKED) {
            p.likedRecords = [...p.likedRecords]
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, this.MAX_LIKED);
        }
        if (p.dislikedRecords.length > this.MAX_DISLIKED) {
            p.dislikedRecords = [...p.dislikedRecords]
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, this.MAX_DISLIKED);
        }
    }

    private async recalculateEmbeddings(): Promise<void> {
        const allRecords = [...this.profile.likedRecords, ...this.profile.dislikedRecords];
        if (allRecords.length === 0) {
            return;
        }

        const texts = allRecords.map((r) => r.text);
        try {
            const newEmbeddings = await this.embeddingProvider.embedBatch(texts);
            if (newEmbeddings.length !== allRecords.length) {
                throw new Error('Mismatch in recalculated embeddings length');
            }

            for (let i = 0; i < allRecords.length; i++) {
                allRecords[i].embedding = newEmbeddings[i];
                allRecords[i].providerId = this.embeddingProvider.providerId;
            }

            this.updateCentroids();
            await this.save();
        } catch (e) {
            console.error('Failed to recalculate embeddings on provider change', e);
        }
    }
}

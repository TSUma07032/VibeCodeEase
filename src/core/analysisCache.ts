import * as vscode from 'vscode';
import { AnalysisResult } from '../types';
import { CodeAnalyzer } from './analyzer';

export interface CachedAnalysis {
    version: number;
    results: AnalysisResult[];
}

/**
 * VS Code ドキュメントの解析結果を URI とバージョンに基づいてキャッシュするクラス
 */
export class AnalysisCache {
    private cache: Map<string, CachedAnalysis> = new Map();

    /**
     * ドキュメントのキャッシュ済み解析結果を取得する。
     * キャッシュが存在しないかバージョンが古い場合は analyzer を実行してキャッシュを更新する。
     */
    public getOrAnalyze(document: vscode.TextDocument, analyzer: CodeAnalyzer): AnalysisResult[] {
        const uri = document.uri.toString();
        const cached = this.cache.get(uri);

        if (cached && cached.version === document.version) {
            return cached.results;
        }

        const results = analyzer.analyze(document.getText());
        this.cache.set(uri, {
            version: document.version,
            results
        });
        return results;
    }

    /**
     * 特定のドキュメントのキャッシュをクリアする
     */
    public clear(uri?: vscode.Uri): void {
        if (uri) {
            this.cache.delete(uri.toString());
        } else {
            this.cache.clear();
        }
    }
}

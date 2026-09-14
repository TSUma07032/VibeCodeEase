import * as assert from 'assert';
import * as vscode from 'vscode';
import { AnalysisCache } from '../core/analysisCache';
import { CodeAnalyzer } from '../core/analyzer';

suite('AnalysisCache Test Suite', () => {
    let cache: AnalysisCache;
    let analyzer: CodeAnalyzer;

    setup(() => {
        cache = new AnalysisCache();
        analyzer = new CodeAnalyzer();
    });

    test('同一バージョンならキャッシュされた結果を返すこと', () => {
        let analyzeCallCount = 0;
        const mockAnalyzer = {
            analyze: (text: string) => {
                analyzeCallCount++;
                return analyzer.analyze(text);
            }
        } as any;

        const mockDoc: any = {
            uri: vscode.Uri.parse('file:///test.ts'),
            version: 1,
            getText: () => 'functon test() {}'
        };

        const res1 = cache.getOrAnalyze(mockDoc, mockAnalyzer);
        assert.strictEqual(analyzeCallCount, 1);
        assert.strictEqual(res1.length, 1);

        const res2 = cache.getOrAnalyze(mockDoc, mockAnalyzer);
        assert.strictEqual(analyzeCallCount, 1); // キャッシュヒット
        assert.strictEqual(res1, res2);
    });

    test('ドキュメントのバージョンが上がると再解析されること', () => {
        let analyzeCallCount = 0;
        const mockAnalyzer = {
            analyze: (text: string) => {
                analyzeCallCount++;
                return analyzer.analyze(text);
            }
        } as any;

        const mockDoc: any = {
            uri: vscode.Uri.parse('file:///test.ts'),
            version: 1,
            getText: () => 'functon test() {}'
        };

        cache.getOrAnalyze(mockDoc, mockAnalyzer);
        assert.strictEqual(analyzeCallCount, 1);

        mockDoc.version = 2;
        cache.getOrAnalyze(mockDoc, mockAnalyzer);
        assert.strictEqual(analyzeCallCount, 2); // 再解析
    });

    test('clear でキャッシュが破棄されること', () => {
        const mockDoc: any = {
            uri: vscode.Uri.parse('file:///test.ts'),
            version: 1,
            getText: () => 'functon test() {}'
        };

        const res1 = cache.getOrAnalyze(mockDoc, analyzer);
        cache.clear(mockDoc.uri);
        const res2 = cache.getOrAnalyze(mockDoc, analyzer);
        assert.notStrictEqual(res1, res2); // 別インスタンスが再生成
    });
});

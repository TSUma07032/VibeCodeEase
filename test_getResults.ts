import * as vscode from 'vscode';
import { SharedAnalysisCache } from './src/core/analyzer';

// Mock vscode.TextDocument
const mockDocument = {
    uri: {
        toString: () => 'file:///app/test.ts'
    },
    version: 1,
    getText: () => 'const a = 1;\n'.repeat(1000),
    languageId: 'typescript',
    fileName: '/app/test.ts'
} as any as vscode.TextDocument;

const cache = SharedAnalysisCache.getInstance();
const results = cache.getResults(mockDocument); // primes the cache

console.time('getResults');
for (let i = 0; i < 10000; i++) {
    cache.getResults(mockDocument);
}
console.timeEnd('getResults');

// Now simulate the size === 0 optimization
console.log('Results size:', results.length);

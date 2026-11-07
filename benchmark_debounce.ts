import * as vscode from 'vscode';
import { InterventionManager } from './src/core/interventionManager';
import { SharedAnalysisCache } from './src/core/analyzer';

const mockDocument = {
    uri: { toString: () => 'file:///app/test.ts' },
    version: 1,
    getText: () => 'const a = 1;\n'.repeat(100),
    languageId: 'typescript',
    fileName: '/app/test.ts'
} as any as vscode.TextDocument;

// Create 100 events, each with 10 changes
const pendingEvents = Array.from({ length: 100 }, () => ({
    document: mockDocument,
    contentChanges: Array.from({ length: 10 }, () => ({
        text: '\n',
        rangeLength: 0,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }
    }))
})) as any as vscode.TextDocumentChangeEvent[];

const allChanges = pendingEvents.flatMap(e => e.contentChanges);

console.time('Legacy Multiple calls');
for (let i = 0; i < 100; i++) {
    for (const pendingEvent of pendingEvents) {
        InterventionManager.handleDocumentChange(pendingEvent);
    }
}
console.timeEnd('Legacy Multiple calls');

// You would mock the new one here.

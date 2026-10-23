export const mockInterventionManager = {
    generateIssueId(documentUri: string, result: any): string {
        return `${documentUri}::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
    },

    handleDocumentChange(event: any, results: any[]): boolean {
        const document = event.document;
        let shouldClear = false;

        for (const change of event.contentChanges) {
            for (const result of results) {
                const id = this.generateIssueId(document.uri, result);
                if (
                    change.range.start.line <= result.range.end.line &&
                    change.range.end.line >= result.range.start.line
                ) {
                    // cache.ignoreIssue(id);
                } else if (shouldInvalidateCache(change, result.range.start.line)) {
                    shouldClear = true;
                }
            }
        }

        return shouldClear;
    }
};

export const optimizedInterventionManager = {
    generateIssueId(documentUri: string, result: any): string {
        return `${documentUri}::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
    },

    handleDocumentChange(event: any, results: any[]): boolean {
        const document = event.document;
        let shouldClear = false;

        for (const change of event.contentChanges) {
            const hasNewLineOrDeletion = change.text.includes('\n') || (change.rangeLength > 0 && change.text === '');
            if (hasNewLineOrDeletion) {
                const linesAdded = change.text.split('\n').length - 1;
                const linesRemoved = change.range.end.line - change.range.start.line;
                if (linesAdded !== linesRemoved) {
                    shouldClear = true;
                    break;
                }
            }
        }

        for (const change of event.contentChanges) {
            for (const result of results) {
                if (
                    change.range.start.line <= result.range.end.line &&
                    change.range.end.line >= result.range.start.line
                ) {
                    const id = this.generateIssueId(document.uri, result);
                    // cache.ignoreIssue(id);
                }
            }
        }
        return shouldClear;
    }
};

function shouldInvalidateCache(
    change: any,
    resultStartLine: number,
): boolean {
    if (change.range.end.line >= resultStartLine) {
        return false;
    }
    const hasNewLineOrDeletion =
        change.text.includes('\n') || (change.rangeLength > 0 && change.text === '');
    if (!hasNewLineOrDeletion) {
        return false;
    }
    const linesAdded = change.text.split('\n').length - 1;
    const linesRemoved = change.range.end.line - change.range.start.line;
    return linesAdded !== linesRemoved;
}

const mockEvent = {
    document: { uri: 'file:///test.ts' },
    contentChanges: Array.from({length: 10}, (_, i) => ({
        range: { start: { line: i }, end: { line: i } },
        text: 'a',
        rangeLength: 0
    }))
};

const mockResults = Array.from({length: 1000}, (_, i) => ({
    source: 'llm',
    category: 'test',
    range: { start: { line: i, character: 0 }, end: { line: i, character: 10 } }
}));

const start = performance.now();
for (let i = 0; i < 100; i++) {
    mockInterventionManager.handleDocumentChange(mockEvent, mockResults);
}
console.log(`Old: ${performance.now() - start} ms`);

const start2 = performance.now();
for (let i = 0; i < 100; i++) {
    optimizedInterventionManager.handleDocumentChange(mockEvent, mockResults);
}
console.log(`New: ${performance.now() - start2} ms`);

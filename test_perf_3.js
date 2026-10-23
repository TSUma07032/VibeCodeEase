const { performance } = require('perf_hooks');

const oldHandleDocumentChange = (event, results) => {
    let shouldClear = false;
    let ignoreCount = 0;
    for (const change of event.contentChanges) {
        for (const result of results) {
            // Expensive string generation on every iteration even if not used!
            const id = `test::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
            if (
                change.range.start.line <= result.range.end.line &&
                change.range.end.line >= result.range.start.line
            ) {
                ignoreCount++;
            } else {
                if (change.range.end.line < result.range.start.line) {
                   const hasNewLineOrDeletion = change.text.includes('\n') || (change.rangeLength > 0 && change.text === '');
                   if (hasNewLineOrDeletion) {
                      const linesAdded = change.text.split('\n').length - 1;
                      const linesRemoved = change.range.end.line - change.range.start.line;
                      if (linesAdded !== linesRemoved) shouldClear = true;
                   }
                }
            }
        }
    }
    return { shouldClear, ignoreCount };
};

const newHandleDocumentChange = (event, results) => {
    let shouldClear = false;
    let ignoreCount = 0;

    // Process changes once to determine cache invalidation
    for (const change of event.contentChanges) {
        for (const result of results) {
            if (change.range.start.line <= result.range.end.line && change.range.end.line >= result.range.start.line) {
                // Generate ID ONLY when we need to ignore
                const id = `test::${result.source ?? 'static'}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
                ignoreCount++;
            } else if (change.range.end.line < result.range.start.line) {
                const hasNewLineOrDeletion = change.text.includes('\n') || (change.rangeLength > 0 && change.text === '');
                if (hasNewLineOrDeletion) {
                    const linesAdded = change.text.split('\n').length - 1;
                    const linesRemoved = change.range.end.line - change.range.start.line;
                    if (linesAdded !== linesRemoved) shouldClear = true;
                }
            }
        }
    }
    return { shouldClear, ignoreCount };
};

const mockEvent = {
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
    oldHandleDocumentChange(mockEvent, mockResults);
}
console.log(`Old: ${performance.now() - start} ms`);

const start2 = performance.now();
for (let i = 0; i < 100; i++) {
    newHandleDocumentChange(mockEvent, mockResults);
}
console.log(`New: ${performance.now() - start2} ms`);

const { performance } = require('perf_hooks');

const InterventionManager = {
    handleDocumentChange: (event) => {
        // Mock getResults
        const results = new Array(50).fill(0).map((_, i) => ({
            range: { start: { line: i * 2, character: 0 }, end: { line: i * 2, character: 10 } }
        }));

        let shouldClear = false;
        for (const change of event.contentChanges) {
            const hasNewLineOrDeletion = change.text.indexOf('\n') !== -1 || (change.rangeLength > 0 && change.text === '');
            if (!hasNewLineOrDeletion) continue;
            for (const result of results) {
                if (change.range.end.line < result.range.start.line) {
                    shouldClear = true;
                    break;
                }
            }
        }
        for (const change of event.contentChanges) {
            for (const result of results) {
                if (result.range.start.line > change.range.end.line) break;
            }
        }
    }
};

const doc = {};
const pendingEvents = [];
for (let i = 0; i < 50; i++) {
    pendingEvents.push({
        document: doc,
        contentChanges: [
            { text: "\n", rangeLength: 0, range: { start: { line: i, character: 0 }, end: { line: i, character: 0 } } }
        ]
    });
}

const t0 = performance.now();
for (let i = 0; i < 1000; i++) {
    for (const pendingEvent of pendingEvents) {
        InterventionManager.handleDocumentChange(pendingEvent);
    }
}
const t1 = performance.now();

const t2 = performance.now();
for (let i = 0; i < 1000; i++) {
    const mergedEvent = {
        document: doc,
        contentChanges: pendingEvents.flatMap(e => e.contentChanges)
    };
    InterventionManager.handleDocumentChange(mergedEvent);
}
const t3 = performance.now();

console.log(`Individual loops: ${(t1 - t0).toFixed(2)}ms`);
console.log(`Merged loop: ${(t3 - t2).toFixed(2)}ms`);

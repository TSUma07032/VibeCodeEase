const { performance } = require('perf_hooks');

const results = [];
for (let i = 0; i < 10000; i++) {
    results.push({ range: { start: { line: i, character: 0 }, end: { line: i, character: 10 } } });
}

// target line 100
const positionLine = 100;

function runOld() {
    let count = 0;
    for (const result of results) {
        if (result.range.start.line > positionLine) {
            break;
        }

        // simulate new Range creation
        const r = { start: result.range.start, end: result.range.end };
        count++;
    }
    return count;
}

function runNew() {
    let count = 0;
    for (const result of results) {
        if (result.range.start.line > positionLine) {
            break;
        }

        // This is the early continue optimization
        if (result.range.end.line < positionLine) {
            continue;
        }

        // simulate new Range creation
        const r = { start: result.range.start, end: result.range.end };
        count++;
    }
    return count;
}

const startOld = performance.now();
for(let i=0; i<10000; i++) runOld();
const endOld = performance.now();

const startNew = performance.now();
for(let i=0; i<10000; i++) runNew();
const endNew = performance.now();

console.log(`Old: ${(endOld - startOld).toFixed(2)}ms`);
console.log(`New: ${(endNew - startNew).toFixed(2)}ms`);

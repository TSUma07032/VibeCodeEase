const { performance } = require('perf_hooks');

const results = [];
for (let i = 0; i < 10000; i++) {
    results.push({ range: { start: { line: i, character: 0 }, end: { line: i, character: 10 } } });
}

function testHoverOld(positionLine) {
    let count = 0;
    for (const result of results) {
        if (result.range.start.line > positionLine) {
            break;
        }

        // simulate new vscode.Range and other logic
        const r = { start: result.range.start, end: result.range.end };
        count++;
    }
    return count;
}

function testHoverNew(positionLine) {
    let count = 0;
    for (const result of results) {
        if (result.range.start.line > positionLine) {
            break;
        }
        if (result.range.end.line < positionLine) {
            continue;
        }

        // simulate new vscode.Range and other logic
        const r = { start: result.range.start, end: result.range.end };
        count++;
    }
    return count;
}

const iterations = 1000;
const targetLine = 9000;

const startOld = performance.now();
for (let i = 0; i < iterations; i++) {
    testHoverOld(targetLine);
}
const endOld = performance.now();

const startNew = performance.now();
for (let i = 0; i < iterations; i++) {
    testHoverNew(targetLine);
}
const endNew = performance.now();

console.log(`Old: ${(endOld - startOld).toFixed(2)}ms`);
console.log(`New: ${(endNew - startNew).toFixed(2)}ms`);

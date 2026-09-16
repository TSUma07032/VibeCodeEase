function testRegex(lineText) {
    const trailingMatch = lineText.match(/^(.*\S)( +)$/);
    return trailingMatch;
}

function testEndsWith(lineText) {
    if (lineText.length === 0 || !lineText.endsWith(' ')) return null;
    const trailingMatch = lineText.match(/^(.*\S)( +)$/);
    return trailingMatch;
}

const noTrailingSpace = "hello world";
const withTrailingSpace = "hello world  ";
const start1 = performance.now();
for(let i=0; i<1000000; i++) {
    testRegex(noTrailingSpace);
}
const end1 = performance.now();
console.log("Regex Only: ", end1 - start1);

const start2 = performance.now();
for(let i=0; i<1000000; i++) {
    testEndsWith(noTrailingSpace);
}
const end2 = performance.now();
console.log("EndsWith + Regex: ", end2 - start2);

const start3 = performance.now();
for(let i=0; i<1000000; i++) {
    testRegex(withTrailingSpace);
}
const end3 = performance.now();
console.log("Regex Only (hit): ", end3 - start3);

const start4 = performance.now();
for(let i=0; i<1000000; i++) {
    testEndsWith(withTrailingSpace);
}
const end4 = performance.now();
console.log("EndsWith + Regex (hit): ", end4 - start4);

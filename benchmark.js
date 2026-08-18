const { performance } = require('perf_hooks');

const code = `functon test() {\n    if condtion:\n        return true;\n}`.repeat(100000);

function withRegex(text) {
  const results = [];
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];

    let functonMatch;
    const functonRegex = /functon/g;
    while ((functonMatch = functonRegex.exec(lineText)) !== null) {
      results.push(functonMatch.index);
    }

    let conditionMatch;
    const conditionRegex = /if condtion:/g;
    while ((conditionMatch = conditionRegex.exec(lineText)) !== null) {
      results.push(conditionMatch.index);
    }
  }
  return results;
}

function withIndexOf(text) {
  const results = [];
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];

    let functonIndex = lineText.indexOf('functon');
    while (functonIndex !== -1) {
      results.push(functonIndex);
      functonIndex = lineText.indexOf('functon', functonIndex + 'functon'.length);
    }

    let conditionIndex = lineText.indexOf('if condtion:');
    while (conditionIndex !== -1) {
      results.push(conditionIndex);
      conditionIndex = lineText.indexOf('if condtion:', conditionIndex + 'if condtion:'.length);
    }
  }
  return results;
}

const start1 = performance.now();
withRegex(code);
const end1 = performance.now();

const start2 = performance.now();
withIndexOf(code);
const end2 = performance.now();

console.log(`Regex: ${end1 - start1}ms`);
console.log(`IndexOf: ${end2 - start2}ms`);

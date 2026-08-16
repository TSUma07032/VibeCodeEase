const { performance } = require('perf_hooks');

const lines = Array(10000).fill('let functonTest = function() { if condtion: return true; }; // functon and if condtion:');

function analyzeRegex() {
  const start = performance.now();
  let count = 0;
  for (let i = 0; i < 100; i++) { // run 100 times to get measurable data
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];

      let functonMatch;
      const functonRegex = /functon/g;
      while ((functonMatch = functonRegex.exec(lineText)) !== null) {
        count++;
      }

      let conditionMatch;
      const conditionRegex = /if condtion:/g;
      while ((conditionMatch = conditionRegex.exec(lineText)) !== null) {
        count++;
      }
    }
  }
  const end = performance.now();
  return end - start;
}

function analyzeIndexOf() {
  const start = performance.now();
  let count = 0;
  for (let i = 0; i < 100; i++) { // run 100 times to get measurable data
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];

      let searchIndex = 0;
      let functonIndex;
      while ((functonIndex = lineText.indexOf('functon', searchIndex)) !== -1) {
        count++;
        searchIndex = functonIndex + 'functon'.length;
      }

      searchIndex = 0;
      let conditionIndex;
      while ((conditionIndex = lineText.indexOf('if condtion:', searchIndex)) !== -1) {
        count++;
        searchIndex = conditionIndex + 'if condtion:'.length;
      }
    }
  }
  const end = performance.now();
  return end - start;
}

console.log(`Regex time: ${analyzeRegex()} ms`);
console.log(`IndexOf time: ${analyzeIndexOf()} ms`);

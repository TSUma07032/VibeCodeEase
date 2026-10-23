const assert = require('assert');

// A simple benchmarker
function benchmark(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

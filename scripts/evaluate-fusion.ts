const { fusionCases } = require('../evaluation/fusion-cases.ts');
const { evaluateFusionCases } = require('../lib/evaluation/fusion.ts');

const result = evaluateFusionCases(fusionCases);
console.log(JSON.stringify(result, null, 2));

if (result.metrics.false_positives > 0 || result.metrics.false_negatives > 0) {
  process.exitCode = 1;
}

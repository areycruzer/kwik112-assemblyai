const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { loadCorpus } = require('../lib/evaluation/load.ts');
const { runEvaluation } = require('../lib/evaluation/run.ts');
const { formatMarkdownReport } = require('../lib/evaluation/score.ts');

type Mode = 'local' | 'hybrid';
type Split = 'development' | 'held_out' | 'all';

interface Options {
  mode: Mode;
  split: Split;
  corpus: string;
  out: string;
}

const usage = `Usage: node scripts/evaluate-triage.ts --mode local|hybrid --split development|held_out|all [--corpus CORPUS_PATH] [--out DIRECTORY]`;

function invalidArguments(): never {
  console.error(usage);
  process.exitCode = 2;
  throw new Error('Invalid evaluation CLI arguments');
}

function parseOptions(arguments_: string[]): Options {
  let mode: Mode | undefined;
  let split: Split | undefined;
  let corpus = 'evaluation/cases.json';
  let out = 'evaluation/results';

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === '--mode' && (value === 'local' || value === 'hybrid')) {
      mode = value;
    } else if (argument === '--split' && (value === 'development' || value === 'held_out' || value === 'all')) {
      split = value;
    } else if (argument === '--corpus' && value) {
      corpus = value;
    } else if (argument === '--out' && value) {
      out = value;
    } else {
      invalidArguments();
    }
    index += 1;
  }

  if (!mode || !split) invalidArguments();
  return { mode, split, corpus, out };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const corpus = await loadCorpus(options.corpus);
  const run = await runEvaluation({ corpus, mode: options.mode, split: options.split });
  const markdown = formatMarkdownReport(run);
  await mkdir(options.out, { recursive: true });
  await writeFile(join(options.out, `${options.mode}-${options.split}-latest.json`), `${JSON.stringify(run, null, 2)}\n`);
  await writeFile(join(options.out, `${options.mode}-${options.split}-latest.md`), markdown);
  console.log(markdown);
}

main().catch((error: unknown) => {
  if (process.exitCode !== 2) console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode ??= 1;
});

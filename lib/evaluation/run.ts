import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { resolveLlm } from '../llm.ts';
import type { localTriage, triageTranscript, TriageResult } from '../triage.ts';
import { aggregateMetrics, compareCase } from './score.ts';
import type { EvaluationCorpus, EvaluationPrediction, EvaluationRun } from './types.ts';

const execFileAsync = promisify(execFile);

export interface RunOptions {
  corpus: EvaluationCorpus;
  split: 'development' | 'held_out' | 'all';
  mode: 'local' | 'hybrid';
  local?: typeof localTriage;
  hybrid?: typeof triageTranscript;
  now?: () => number;
  commit?: () => Promise<string | null>;
}

type ConfiguredLlm = ReturnType<typeof resolveLlm>;

async function configuredLlm(): Promise<ConfiguredLlm> {
  try {
    const { resolveLlm: configured } = await import('../llm.ts');
    return configured();
  } catch {
    return { provider: 'none', client: null, model: '', disableThinking: false };
  }
}

async function dependencies(options: RunOptions): Promise<{
  local: typeof localTriage;
  hybrid: typeof triageTranscript;
  configuredLlm: ConfiguredLlm;
}> {
  if (options.local && options.hybrid) {
    return {
      local: options.local,
      hybrid: options.hybrid,
      configuredLlm: await configuredLlm(),
    };
  }

  const [{ localTriage: defaultLocal, triageTranscript: defaultHybrid }, llm] = await Promise.all([
    import('../triage.ts'),
    configuredLlm(),
  ]);
  return {
    local: options.local ?? defaultLocal,
    hybrid: options.hybrid ?? defaultHybrid,
    configuredLlm: llm,
  };
}

async function currentCommit(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function runEvaluation(options: RunOptions): Promise<EvaluationRun> {
  const now = options.now ?? performance.now.bind(performance);
  const { local, hybrid, configuredLlm } = await dependencies(options);
  const cases = options.corpus.cases.filter((item) =>
    options.split === 'all' || item.split === options.split,
  );
  const evaluated = [];

  for (const evaluationCase of cases) {
    const started = now();
    let result: TriageResult;

    if (options.mode === 'local') {
      result = local(evaluationCase.transcript);
    } else {
      try {
        result = await hybrid(evaluationCase.transcript);
      } catch {
        result = local(evaluationCase.transcript);
      }
    }

    const prediction: EvaluationPrediction = {
      incident_type: result.extraction.incident_type,
      severity: result.extraction.severity,
      location_text: result.extraction.location.address ?? result.extraction.location.city,
      threat_text: result.extraction.immediate_threats,
      method: result.method,
      latency_ms: now() - started,
      fell_back: options.mode === 'hybrid' && result.method === 'keyword',
    };
    evaluated.push(compareCase(evaluationCase, prediction));
  }

  const commit = await (options.commit ?? currentCommit)();
  return {
    metadata: {
      benchmark_version: options.corpus.version,
      split: options.split,
      mode: options.mode,
      evaluated_at: new Date().toISOString(),
      provider: configuredLlm.provider,
      model: configuredLlm.model || null,
      commit,
      node_version: process.version,
      case_count: evaluated.length,
      model_attempted: options.mode === 'hybrid' && configuredLlm.provider !== 'none',
    },
    metrics: aggregateMetrics(evaluated),
    cases: evaluated,
  };
}

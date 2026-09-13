/**
 * @module llm
 * @description Provider-agnostic chat client. GLM (Zhipu / BigModel) is the
 *              default; OpenAI is used when only OPENAI_API_KEY is configured.
 *              Both speak the same OpenAI-compatible wire format, so callers do
 *              not care which one answered.
 */

import OpenAI from 'openai';
import { logger } from './logger.ts';

export type LlmProvider = 'glm' | 'openai' | 'none';

/** GLM's China host is materially faster than the international one from most
 *  regions we serve; override with GLM_BASE_URL if that stops being true. */
const GLM_DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

/** glm-4.5-flash is the free-tier model. Paid models return HTTP 429
 *  ("insufficient balance") until the account carries credit. */
const GLM_DEFAULT_MODEL = 'glm-4.5-flash';

const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';

export interface LlmConfig {
  provider: LlmProvider;
  client: OpenAI | null;
  model: string;
  /** GLM 4.5 reasons by default, which triples token use and latency for a
   *  task that needs extraction rather than deliberation. */
  disableThinking: boolean;
}

export function resolveLlm(): LlmConfig {
  const glmKey = process.env.GLM_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  // LLM_PROVIDER=glm|openai forces one provider regardless of which keys are
  // present; the default 'auto' prefers GLM (free tier) and falls back to any
  // OpenAI-compatible endpoint when GLM is unconfigured.
  const forced = (process.env.LLM_PROVIDER || 'auto').toLowerCase();

  if (glmKey && forced !== 'openai') {
    return {
      provider: 'glm',
      client: new OpenAI({
        apiKey: glmKey,
        baseURL: process.env.GLM_BASE_URL || GLM_DEFAULT_BASE_URL,
      }),
      model: process.env.GLM_MODEL || GLM_DEFAULT_MODEL,
      disableThinking: true,
    };
  }

  if (openaiKey && forced !== 'glm') {
    return {
      provider: 'openai',
      client: new OpenAI({
        apiKey: openaiKey,
        // OPENAI_BASE_URL makes the same code path work with any
        // OpenAI-compatible gateway (Azure-style proxies, local vLLM, etc).
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      }),
      model: process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL,
      disableThinking: false,
    };
  }

  return { provider: 'none', client: null, model: '', disableThinking: false };
}

/** How long to wait before abandoning the model and using local rules. */
export function llmTimeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 25_000;
}

export interface JsonCompletionArgs {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * @description Request a JSON object from the configured provider. Returns null
 *              rather than throwing, so an emergency path can fall through to
 *              local rules instead of failing the request.
 */
export async function requestJson(
  cfg: LlmConfig,
  { system, user, maxTokens = 1200, temperature = 0.1 }: JsonCompletionArgs
): Promise<{ data: any; model: string } | null> {
  if (!cfg.client) return null;

  const started = Date.now();

  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };

    // Not part of the OpenAI schema, but the SDK passes unknown top-level
    // fields through to the wire (verified against openai v6). GLM 4.5 reasons
    // by default, which burns the token budget on hidden reasoning and can push
    // a completion past the caller's timeout.
    if (cfg.disableThinking) body.thinking = { type: 'disabled' };

    const completion = (await cfg.client.chat.completions.create(body as any, {
      timeout: llmTimeoutMs(),
      maxRetries: 0,
    })) as any;

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      logger.warn('LLM returned no content', { provider: cfg.provider, model: cfg.model });
      return null;
    }

    logger.info('LLM completion', {
      provider: cfg.provider,
      model: cfg.model,
      ms: Date.now() - started,
      completionTokens: completion?.usage?.completion_tokens,
    });

    return { data: JSON.parse(content), model: cfg.model };
  } catch (error) {
    logger.error('LLM request failed; caller should fall back', {
      provider: cfg.provider,
      model: cfg.model,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

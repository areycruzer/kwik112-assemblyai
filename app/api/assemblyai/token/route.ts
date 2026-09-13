/**
 * AssemblyAI Voice Agent session token.
 * Mints a short-lived token so the browser can open the voice-agent WebSocket
 * without ever seeing ASSEMBLYAI_API_KEY. Mirrors the Hume token route's
 * behaviour: 503 when the key is missing so the UI's scripted-caller fallback
 * still triggers, 502 on upstream failure.
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const TOKEN_URL = 'https://agents.assemblyai.com/v1/token';
const TOKEN_TTL_SECONDS = 60;
const MAX_SESSION_SECONDS = 300;

// Minted tokens are reused until ~10s before their expiry.
let cached: { token: string; expiresAt: number } | null = null;

// Simple per-IP throttle: a public demo must not hammer the mint endpoint.
const WINDOW_MS = 60_000;
const MAX_MINTS_PER_WINDOW = 12;
const mints = new Map<string, number[]>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const list = (mints.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_MINTS_PER_WINDOW) {
    mints.set(ip, list);
    return true;
  }
  list.push(now);
  mints.set(ip, list);
  return false;
}

export async function GET(req: Request) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AssemblyAI credentials are not configured on the server.' },
      { status: 503 },
    );
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (throttled(ip)) {
    return NextResponse.json(
      { error: 'Too many token requests. Try again shortly.' },
      { status: 429 },
    );
  }

  if (cached && Date.now() < cached.expiresAt - 10_000) {
    return NextResponse.json({ token: cached.token, cached: true });
  }

  try {
    const res = await fetch(
      `${TOKEN_URL}?expires_in_seconds=${TOKEN_TTL_SECONDS}&max_session_duration_seconds=${MAX_SESSION_SECONDS}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' },
    );
    if (!res.ok) {
      logger.error('AssemblyAI token mint failed', { status: res.status });
      return NextResponse.json(
        { error: 'Could not authenticate with AssemblyAI.' },
        { status: 502 },
      );
    }
    const data = await res.json();
    if (!data?.token) {
      return NextResponse.json(
        { error: 'AssemblyAI returned no token.' },
        { status: 502 },
      );
    }
    cached = { token: data.token, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000 };
    logger.info('AssemblyAI agent token minted');
    return NextResponse.json({ token: data.token, cached: false });
  } catch (error) {
    logger.error('AssemblyAI token mint threw', {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: 'Could not reach AssemblyAI.' }, { status: 502 });
  }
}

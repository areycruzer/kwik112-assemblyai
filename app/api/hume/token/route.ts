/**
 * Hume EVI Access Token
 * Mints a short-lived client_credentials token so the browser can open an EVI
 * socket without ever seeing HUME_API_KEY / HUME_SECRET_KEY.
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

let cached: { token: string; expiresAt: number } | null = null;

export async function GET() {
  const apiKey = process.env.HUME_API_KEY;
  const secretKey = process.env.HUME_SECRET_KEY;
  // Recording configuration requested by the owner; source session settings
  // still apply the repository's emergency intake prompt after connection.
  const configId = 'c6464fe6-6281-4f91-b564-24a8b12ba5c6';

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: 'Hume credentials are not configured on the server.' },
      { status: 503 }
    );
  }

  // Reuse the token until it is within 60s of expiry.
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return NextResponse.json({ accessToken: cached.token, configId, cached: true });
  }

  try {
    const response = await fetch('https://api.hume.ai/oauth2-cc/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      cache: 'no-store',
    });

    if (!response.ok) {
      logger.error('Hume token mint failed', { status: response.status });
      return NextResponse.json(
        { error: 'Could not authenticate with Hume. Check the API and secret keys.' },
        { status: 502 }
      );
    }

    const data = await response.json();
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 1800;

    cached = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    logger.info('Hume access token minted', { expiresIn });

    return NextResponse.json({ accessToken: data.access_token, configId, cached: false });
  } catch (error) {
    logger.error('Hume token mint threw', {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: 'Could not reach Hume.' }, { status: 502 });
  }
}

/**
 * AI Triage Extraction API Route
 * Thin wrapper over lib/triage so this route and /api/calls/create cannot drift.
 */

import { NextRequest, NextResponse } from 'next/server';
import { triageTranscript, scoreOf, recommendUnits } from '@/lib/triage';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'transcript (string) is required' }, { status: 400 });
    }

    const result = await triageTranscript(transcript);

    return NextResponse.json({
      success: true,
      extraction: result.extraction,
      severity_score: scoreOf(result),
      labels: result.labels,
      flags: result.flags,
      recommended_units: recommendUnits(result.extraction.incident_type, result.extraction.severity),
      method: result.method,
    });
  } catch (error) {
    logger.error('Extraction failed', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Failed to extract information' }, { status: 500 });
  }
}

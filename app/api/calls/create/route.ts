/**
 * Call Creation API Route
 * Turns a finished EVI conversation (transcript + prosody frames) into a
 * triaged EmergencyCall for the dispatch board.
 *
 * This route runs LOCAL RULES ONLY, so it returns in milliseconds. The operator
 * sees a graded incident the instant the call ends instead of waiting on the
 * model. The returned call is marked `refinable: true`; the client then calls
 * `POST /api/calls/refine` to upgrade it in place with the model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildCall } from '../_buildCall';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, chatGroupId } = body ?? {};

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
    }

    // Local rules only — no network, returns in microseconds.
    const call = await buildCall(
      {
        phoneNumber,
        transcript: body?.transcript,
        emotions: body?.emotions,
        chatGroupId: body?.chatGroupId,
        conversationId: body?.conversationId,
        callDurationSeconds: body?.callDurationSeconds,
        reportedLocation: body?.reportedLocation,
        prosodySource: body?.prosodySource,
        detectedLanguage: body?.detectedLanguage,
      },
      'local'
    );

    logger.info('Emergency call triaged (local)', {
      id: call.id,
      severity: call.severity,
      severityScore: call.severity_score,
      method: call.triage_method,
      chatGroupId,
      segments: Array.isArray(call.transcript) ? call.transcript.length : 0,
      emotionFrames: Array.isArray(call.emotion_data) ? call.emotion_data.length : 0,
    });

    return NextResponse.json({
      success: true,
      call,
      triage_method: call.triage_method,
      refinable: true,
    });
  } catch (error) {
    logger.error('Call creation failed', {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: 'Failed to create call' }, { status: 500 });
  }
}

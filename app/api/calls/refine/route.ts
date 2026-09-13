/**
 * Call Refinement API Route
 * Upgrades a local-rules grade with the language model, in place. The client
 * calls this after `POST /api/calls/create` has already put a graded incident on
 * the board, so this route is pure enrichment.
 *
 * Two guarantees hold this route to the life-or-death standard the rest of the
 * triage code keeps:
 *   1. The model may only RAISE severity, never lower it. `triageTranscript`
 *      enforces that; a model that misses "no pulse" must not downgrade what the
 *      rules caught.
 *   2. This route NEVER returns 5xx because the model was slow or absent. When
 *      the model is unavailable it returns the local grade with
 *      `triage_method: 'keyword'` and an empty `changed`. Refinement failing
 *      must not interrupt the operator.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildCall, BuildCallInput } from '../_buildCall';
import { EmergencyCall } from '@/lib/types';
import { logger } from '@/lib/logger';

/** Fields whose change between the local and model grades the client flashes. */
function changedFields(local: EmergencyCall, model: EmergencyCall): string[] {
  const changed: string[] = [];
  if (model.severity !== local.severity) changed.push('severity');
  if (model.severity_score !== local.severity_score) changed.push('severity_score');
  if (model.incident_subtype !== local.incident_subtype) changed.push('incident_subtype');
  if (model.caller_location?.address !== local.caller_location?.address) {
    changed.push('caller_location.address');
  }
  if (model.ai_summary !== local.ai_summary) changed.push('ai_summary');
  return changed;
}

export async function POST(request: NextRequest) {
  let input: BuildCallInput | null = null;

  try {
    const body = await request.json();
    const { phoneNumber } = body ?? {};

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
    }

    input = {
      callId: typeof body?.callId === 'string' ? body.callId : undefined,
      phoneNumber,
      transcript: body?.transcript,
      emotions: body?.emotions,
      chatGroupId: body?.chatGroupId,
      conversationId: body?.conversationId,
      callDurationSeconds: body?.callDurationSeconds,
      reportedLocation: body?.reportedLocation,
      prosodySource: body?.prosodySource,
      detectedLanguage: body?.detectedLanguage,
    };

    // Build both grades from the SAME shared assembly so they can never drift.
    // `local` is the baseline the operator already saw; `model` is the upgrade.
    const local = await buildCall(input, 'local');
    const model = await buildCall(input, 'model');

    const changed = changedFields(local, model);
    const model_escalated = (model.severity_score ?? 0) > (local.severity_score ?? 0);

    const call: EmergencyCall = {
      ...model,
      refinable: false,
      model_escalated,
    };

    logger.info('Emergency call refined', {
      id: call.id,
      method: call.triage_method,
      changed,
      modelEscalated: model_escalated,
      localScore: local.severity_score,
      modelScore: model.severity_score,
    });

    return NextResponse.json({
      success: true,
      call,
      triage_method: call.triage_method,
      changed,
    });
  } catch (error) {
    // Refinement is enrichment. Its failure must not surface a 5xx to the
    // operator — fall back to the local grade with an empty `changed`.
    logger.error('Refinement failed; returning local grade', {
      error: error instanceof Error ? error.message : error,
    });

    if (!input) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    try {
      const local = await buildCall(input, 'local');
      const call: EmergencyCall = { ...local, refinable: false, model_escalated: false };
      return NextResponse.json({
        success: true,
        call,
        triage_method: call.triage_method,
        changed: [],
      });
    } catch (fallbackError) {
      logger.error('Local fallback also failed during refine', {
        error: fallbackError instanceof Error ? fallbackError.message : fallbackError,
      });
      return NextResponse.json({ error: 'Failed to refine call' }, { status: 500 });
    }
  }
}

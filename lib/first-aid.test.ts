import test from 'node:test';
import assert from 'node:assert/strict';

import { selectPreArrivalGuidance } from './first-aid.ts';

test('selects conditional dispatcher-read CPR guidance for a critical medical call', () => {
  const guidance = selectPreArrivalGuidance({
    incidentType: 'medical_emergency',
    severity: 'critical',
  });

  assert.equal(guidance.id, 'medical-critical');
  assert.equal(guidance.audience, 'dispatcher-read');
  assert.match(guidance.instructions.join(' '), /if.*not breathing normally.*chest compressions/i);
  assert.match(guidance.instructions.join(' '), /speaker/i);
});

test('selects hazard-specific guidance deterministically by incident type and severity', () => {
  const fire = selectPreArrivalGuidance({ incidentType: 'fire', severity: 'high' });
  const collision = selectPreArrivalGuidance({ incidentType: 'accident', severity: 'high' });
  const crime = selectPreArrivalGuidance({ incidentType: 'crime', severity: 'critical' });

  assert.equal(fire.id, 'fire-high');
  assert.match(fire.instructions.join(' '), /leave|exit/i);
  assert.match(fire.instructions.join(' '), /do not.*re-enter/i);
  assert.equal(collision.id, 'accident-high');
  assert.match(collision.instructions.join(' '), /do not move/i);
  assert.equal(crime.id, 'crime-critical');
  assert.match(crime.instructions.join(' '), /do not confront|safe place/i);
});

test('guidance remains conservative and avoids promises or definitive medical claims', () => {
  const incidentTypes = ['medical_emergency', 'fire', 'accident', 'crime', 'public_safety', 'other'] as const;
  const severities = ['critical', 'high', 'medium', 'low'] as const;

  for (const incidentType of incidentTypes) {
    for (const severity of severities) {
      const guidance = selectPreArrivalGuidance({ incidentType, severity });
      const text = [guidance.title, ...guidance.instructions, guidance.caution].join(' ');
      assert.doesNotMatch(text, /definitely|diagnos(?:e|is)|will survive|help is on the way|you are safe/i);
      assert.match(guidance.caution, /dispatcher|safe|instructions/i);
    }
  }
});

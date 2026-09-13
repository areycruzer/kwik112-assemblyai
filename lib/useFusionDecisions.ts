'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FUSION_STORAGE_KEY,
  readFusionDecisions,
  recordFusionDecision,
  writeFusionDecisions,
  type FusionDecisionAction,
  type FusionDecisionMap,
  type FusionSuggestion,
} from './incident-fusion';

const FUSION_UPDATED_EVENT = 'kwik112-fusion-updated';

export function useFusionDecisions() {
  const [decisions, setDecisions] = useState<FusionDecisionMap>({});

  useEffect(() => {
    const refresh = () => setDecisions(readFusionDecisions());
    const onStorage = (event: StorageEvent) => {
      if (event.key === FUSION_STORAGE_KEY) refresh();
    };
    refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener(FUSION_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(FUSION_UPDATED_EVENT, refresh);
    };
  }, []);

  const decide = useCallback((suggestion: FusionSuggestion, action: FusionDecisionAction) => {
    const next = recordFusionDecision(readFusionDecisions(), suggestion, action);
    writeFusionDecisions(next);
    setDecisions(next);
    window.dispatchEvent(new Event(FUSION_UPDATED_EVENT));
  }, []);

  return { decisions, decide };
}

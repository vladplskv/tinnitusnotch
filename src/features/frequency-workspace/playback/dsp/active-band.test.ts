import type { TinnitusMatch } from '../../model/types';
import { describe, expect, it } from 'vitest';

import {
  resolvePaper2025V1ActiveBand,
  TINNITUS_MATCH_FREQUENCIES_HZ,
} from './active-band';

function match(
  frequencyHz: number,
  overrides: Readonly<Record<string, 'audible' | 'inaudible' | 'unknown'>> = {},
): TinnitusMatch {
  return {
    frequencyHz,
    type: 'tone',
    audibilityByFrequencyHz: Object.fromEntries(
      TINNITUS_MATCH_FREQUENCIES_HZ.map(value => [
        String(value),
        overrides[String(value)] ?? 'audible',
      ]),
    ),
  };
}

describe('paper-2025-v1 Active Band resolution', () => {
  it('resolves the accepted A1 band from the confirmed projection', () => {
    expect(resolvePaper2025V1ActiveBand(match(4_000), 4_000)).toEqual({
      kind: 'resolved',
      bandHz: [2_800, 5_700],
    });
  });

  it('selects A2 when any A1 observation is inaudible', () => {
    expect(
      resolvePaper2025V1ActiveBand(
        match(4_800, { '8000': 'inaudible' }),
        4_800,
      ),
    ).toEqual({ kind: 'resolved', bandHz: [2_800, 5_700] });
  });

  it('blocks AM while any required observation is unknown', () => {
    expect(
      resolvePaper2025V1ActiveBand(match(4_800, { '1000': 'unknown' }), 4_800),
    ).toEqual({ kind: 'unavailable', reason: 'audibility-incomplete' });
  });

  it('reports an unavailable match when fallback is required but unspecified', () => {
    expect(
      resolvePaper2025V1ActiveBand(
        match(1_000, { '1200': 'inaudible' }),
        1_000,
      ),
    ).toEqual({ kind: 'unavailable', reason: 'fallback-unavailable' });
  });
});

# De-correlating AM

The AM source follows Yukhnovich et al., "Chronic tinnitus is quietened by sound therapy using a
novel cross-frequency de-correlating stimulus modulation", Hearing Research 464 (2025) 109335. The
contract is versioned as `paper-2025-v1`
([DSP](../../src/features/frequency-workspace/playback/dsp/paper-2025-v1.ts)). The name records a
product contract, not a claim of trial equivalence.

## One-pass DSP

The DSP core is stateful and runs sample by sample. The production AudioWorklet imports it directly,
and fixed-seed tests call the same code across arbitrary chunk boundaries. Precomputed 4 s buffers
would delay live edits, and a second copy of the equations for tests would drift from production.
Master gain and the analyser stay outside the source, under Therapy Playback.

## Matches the paper

- Carrier: non-overlapping 4 s harmonic complexes, 1 s raised-cosine ramps, random f0 of 96 to 256 Hz,
  harmonics from 1 to 16 kHz with random phases (section 4.3.4).
- Modulation: `A_n(t) = 1 + sin(2π[ωt + F_n·S(t)] + q)` with ω = 1 Hz, `F_n = log2(f/c)` from the band's log
  centre, and `S(t) = 4.5 + 3·sin(p + 2π·0.125·t)`. `p` and `q` are redrawn per segment (eq. 2 to 5).
- Active Band: the primary (A1) and fallback (A2) bands of Table 1 for all 17 match frequencies, in
  [active-band.ts](../../src/features/frequency-workspace/playback/dsp/active-band.ts). The fallback
  applies when the primary band contains an inaudible frequency.
- Hearing Correction curves of Fig. 1: 0, 15, 30 or 45 dB maximum, zero up to 2 kHz, 1/9 at 2.8 kHz,
  8/9 at 8 kHz, maximum above.

## Product decisions the paper does not cover

- AM is blocked when no usable band is left (fallback missing or also inaudible). The UI explains it
  and disables start rather than letting playback fail.
- Audibility of the 17 frequencies is asked explicitly; the paper inferred it while participants
  chose a hearing profile.
- Output is RMS-normalized, and the four correction previews play at the same RMS so the comparison
  is about slope, not level. Nothing is SPL-calibrated.
- Hearing Correction ids are `a1`, `a2`, `c1`, `c2` in stored data. They do not mean the paper's
  A1/C1 band labels; the UI shows the paper's profile names.
- Sham Control, phase modulation and noise replacement are not offered.

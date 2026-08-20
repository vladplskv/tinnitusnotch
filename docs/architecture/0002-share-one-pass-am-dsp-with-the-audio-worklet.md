# ADR 0002: Share one-pass AM DSP with the AudioWorklet

Status: accepted

## Context

Precomputed four-second buffers would add latency to live edits and risk making offline tests exercise formulas different from production. Duplicating the AM equations inside an AudioWorklet and a test helper has the same parity problem.

The source material also leaves unresolved trial details around random phase, A2/C2 fallback semantics, hearing-profile curves, and calibrated output. The product must not silently claim exact clinical parity.

## Decision

The versioned `paper-2025-v1` core is a stateful, sample-by-sample DSP module. The production AudioWorklet imports that core directly, while deterministic fixed-seed tests call the same implementation over arbitrary chunk boundaries.

The source adapter resolves a confirmed Active Band, creates the worklet, and updates supported live values without preparing audio buffers. Master gain and the post-master analyser remain outside the filter source under Therapy Playback ownership.

## Consequences

Generation is online and one-pass. Tests protect chunk invariance and production algebra without copying formulas. The version name records an explicit product contract, not a claim of exact trial reproduction. SPL calibration, clinical safety, and unresolved research variants remain outside this implementation.

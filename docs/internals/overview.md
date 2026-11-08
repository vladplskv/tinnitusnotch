# Architecture

The app is one page around one `FrequencyWorkspace`
([facade](../../src/features/frequency-workspace/application/frequency-workspace.ts)). It owns the
current Therapy Session and orders every side effect: model transitions, Therapy Playback,
persistence, confirmations, notifications and derived capabilities. Earlier routes let several UI
components own filter state, storage or Web Audio, which made filter switches, live edits, presets,
tab conflicts and teardown hard to reason about as one session.

## Boundaries

The page creates the workspace after client settlement, renders its immutable snapshots, forwards
user intents and disposes it on teardown. UI code never touches Web Audio nodes, `localStorage` or
model internals.

- `model`: pure session, readiness and preset rules.
- `playback`: one serialized Web Audio lifecycle behind `TherapyPlayback`. Matching Stimulus and
  Therapy Filters are mutually exclusive; a newer request aborts stale work.
- `persistence`: one revisioned document behind `WorkspaceDocumentStore`, with conflict detection
  across tabs. Older storage keys are intentionally not migrated.
- `visualization`: pure scale, aggregation, overlay and canvas helpers.
- `ui`: snapshots in, intents out.

Production adapters are replaceable by the deterministic fakes in `test-support`, which is what the
facade tests run against.

## Preset rule

Save Changes keeps a preset's Therapy Filter. A session with another filter must be saved as a new
preset (`replaceTherapyPresetSnapshot` throws), and the UI disables the button instead of failing.

## Hearing check probe

The 17-frequency audibility check plays its probe beeps with a local oscillator in
[hearing-check.tsx](../../src/features/frequency-workspace/ui/components/hearing-check.tsx), not
through Therapy Playback, because the facade has no intent for a short probe. Starting a probe stops
any playback first, so the two never sound together.

# ADR 0001: Frequency Workspace owns session orchestration

Status: accepted

## Context

The previous routes and UI components could each become owners of filter state, browser storage, or Web Audio. That makes filter switching, live edits, presets, tab conflicts, and teardown difficult to reason about as one session.

## Decision

`FrequencyWorkspace` is the application-level facade for the page. It owns the current Therapy Session and coordinates model transitions, Therapy Playback, persistence, confirmations, notifications, and derived capabilities.

The Solid page creates one workspace after client settlement, subscribes to immutable snapshots, forwards user intents, reads spectrum frames, and disposes the workspace on teardown. Presentational UI does not import Web Audio nodes, localStorage, or model internals.

The boundaries are:

- `model`: pure session, readiness, and preset operations;
- `playback`: one serialized Web Audio lifecycle behind `TherapyPlayback`;
- `persistence`: one revisioned document behind `WorkspaceDocumentStore`;
- `visualization`: pure scale, aggregation, overlay, and rendering helpers;
- `ui`: snapshots in, intents out.

## Consequences

There is one authority for ordering side effects and rejecting stale work. Production adapters remain replaceable by deterministic fakes. The application facade is intentionally substantial, but it exposes a smaller interface than the combined subsystems it hides.

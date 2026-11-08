# AGENTS.md

## Project
- Name: `tinnitusnotch`
- Stack: `TypeScript`, `Vite`

## Goals
- Keep changes minimal and focused.
- Prefer safe, incremental updates.

## Local Commands
- Install: `pnpm install` (pnpm 11, see `packageManager`)
- Dev: `pnpm dev`
- Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- Browser smoke test: `pnpm test:e2e`
- Preview deploy: `pnpm deploy:preview`

## Code Style
- Follow existing project patterns.
- Avoid unrelated refactors.
- Keep naming clear and consistent.

## Definition of Done
- Code compiles successfully.
- Main flow works locally.
- No unrelated files changed.

## Documentation
Docs live in `docs/` (index: `docs/README.md`). Most code changes need no doc change.
- `docs/user/`: Russian task guides for people using the app. Update the relevant section when how to use a feature changes; skip UI tweaks and implementation details.
- `docs/internals/`: decisions, cross-cutting constraints and traps that the code does not show. Do not narrate control flow, list fields or files, or append change summaries. When a decision changes, rewrite the text instead of adding another account.
- `docs/internals/glossary.md`: shared domain vocabulary, not a feature index.
- `docs/operations/`: setup, checks and deployment procedures.
- A reason that matters only locally goes in a short code comment, not a doc.

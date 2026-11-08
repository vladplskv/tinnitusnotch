# Разработка

Нужны Node.js 22 или новее и pnpm 11: lockfile и `pnpm-workspace.yaml` требуют именно его, версия закреплена в `packageManager`.

```bash
pnpm install
pnpm dev
```

## Проверки

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Браузерный smoke-тест AudioWorklet запускается отдельно. Один раз установите для него Chromium:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

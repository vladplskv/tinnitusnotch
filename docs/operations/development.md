# Разработка

В CI используется Node.js 26.13.1. Для ветки Node.js 22 требуется как минимум 22.13. Версия pnpm закреплена в поле `packageManager` файла `package.json`.

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

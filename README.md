[![Deploy static content to Pages](https://github.com/vladplskv/tinnitusnotch/actions/workflows/main.yml/badge.svg)](https://github.com/vladplskv/tinnitusnotch/actions/workflows/main.yml)

# Tinnitus Notch

Одностраничный Frequency Workspace для подбора частоты и настройки звука. В нём доступны два фильтра:

- White Noise с настраиваемой центральной частотой и шириной выреза;
- экспериментальный De-correlating AM с подтверждаемым Active Band и Hearing Correction.

Интерфейс устроен как пульт: сверху график частот с ручками, под ним модули частоты и звука терапии, для AM ещё подготовка (рабочая полоса, проверка слуха, коррекция). Раздел «Тренер» задаёт те же вопросы по одному. Плеер с запуском, «Стоп» и громкостью закреплён внизу экрана, пресеты открываются из шапки. Частоту и поддерживаемые параметры можно менять во время воспроизведения. Настройки сессии и пресеты сохраняются локально в текущем браузере.

> Это экспериментальный звуковой инструмент, а не медицинская услуга. Он не калибрует SPL и не подтверждает безопасность или эквивалентность клиническому протоколу. Начинайте с низкой системной громкости и немедленно останавливайте неприятный звук.

## Локальный запуск

Требуется Node.js и pnpm.

```bash
pnpm install
pnpm dev
```

Vite покажет локальный адрес в терминале.

## Проверки

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Браузерный AudioWorklet smoke-тест запускается отдельно и требует установленный Chromium для Playwright:

```bash
pnpm test:e2e
```

## Развёртывание

- Основной сайт: GitHub Pages, https://vladplskv.github.io/tinnitusnotch/. Workflow `.github/workflows/main.yml` запускается вручную из вкладки Actions и публикует `main`.
- Cloudflare Workers Builds публикует `main` на https://tinnitusnotch.vlad-plskv.workers.dev после каждого merge.
- Preview: отдельный воркер Cloudflare, https://tinnitusnotch-preview.vlad-plskv.workers.dev. Публикуется командой `pnpm deploy:preview` (нужен `wrangler login`).

## Архитектура

Основной модуль находится в `src/features/frequency-workspace`:

- `application`: единый фасад состояния и пользовательских команд;
- `model`: сессии, готовность AM и пресеты;
- `playback`: сериализованное Web Audio воспроизведение и источники;
- `playback/dsp`: общий однопроходный DSP-контракт `paper-2025-v1`;
- `persistence`: версионированный документ и защита от конфликтов вкладок;
- `visualization`: логарифмическая шкала, спектр и оверлеи;
- `ui`: пульт, тренер, проверка слуха и плеер.

Старые ключи браузерного хранилища намеренно не мигрируются. Текущий документ хранится под ключом `tinnitusnotch.workspace.v1`.

Подробная пользовательская инструкция: [DECORR_AM_USAGE.md](./DECORR_AM_USAGE.md).

## Deployment

Production-сборка создаётся командой `pnpm build`. Конфигурация Cloudflare находится в `wrangler.jsonc`; публикация выполняется командой `pnpm deploy`.

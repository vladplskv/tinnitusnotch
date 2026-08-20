[![Deploy static content to Pages](https://github.com/vladplskv/tinnitusnotch/actions/workflows/main.yml/badge.svg)](https://github.com/vladplskv/tinnitusnotch/actions/workflows/main.yml)

# Tinnitus Notch

Одностраничный Frequency Workspace для подбора частоты и настройки звука. В нём доступны два фильтра:

- White Noise с настраиваемой центральной частотой и Q;
- экспериментальный De-correlating AM с подтверждаемым Active Band и Hearing Correction.

Интерфейс сначала проводит пользователя по четырём шагам, а затем открывает полную форму. Частоту и поддерживаемые параметры можно менять во время воспроизведения. Настройки сессии и пресеты сохраняются локально в текущем браузере.

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

## Архитектура

Основной модуль находится в `src/features/frequency-workspace`:

- `application` — единый фасад состояния и пользовательских команд;
- `model` — сессии, готовность AM и пресеты;
- `playback` — сериализованное Web Audio воспроизведение и источники;
- `playback/dsp` — общий однопроходный DSP-контракт `paper-2025-v1`;
- `persistence` — версионированный документ и защита от конфликтов вкладок;
- `visualization` — логарифмическая шкала, спектр и оверлеи;
- `ui` — guided tour и полная форма.

Старые ключи браузерного хранилища намеренно не мигрируются. Текущий документ хранится под ключом `tinnitusnotch.workspace.v1`.

Подробная пользовательская инструкция: [DECORR_AM_USAGE.md](./DECORR_AM_USAGE.md).

## Deployment

Production-сборка создаётся командой `pnpm build`. Конфигурация Cloudflare находится в `wrangler.jsonc`; публикация выполняется командой `pnpm deploy`.

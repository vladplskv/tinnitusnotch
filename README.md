[![Deploy to Object Storage](https://github.com/vladplskv/tinnitusnotch/actions/workflows/deploy.yml/badge.svg)](https://github.com/vladplskv/tinnitusnotch/actions/workflows/deploy.yml)

# Tinnitus Notch

[Открыть прежнюю версию на GitHub Pages](https://vladplskv.github.io/tinnitusnotch/)

Веб-приложение для подбора частоты шума в ушах и звуковой терапии. Три звука: белый шум с вырезом вокруг вашей частоты, экспериментальная De-correlating AM по [Yukhnovich et al., 2025](https://doi.org/10.1016/j.heares.2025.109335) и экспериментальные CR-тоны (ACRN). Настройки и пресеты хранятся в браузере.

> Это экспериментальный звуковой инструмент, а не медицинская услуга. Он не калибрует громкость и не подтверждает безопасность или эквивалентность клиническому протоколу. Начинайте с низкой системной громкости и сразу останавливайте неприятный звук.

```bash
pnpm install
pnpm dev
```

Документация: [docs/README.md](./docs/README.md).

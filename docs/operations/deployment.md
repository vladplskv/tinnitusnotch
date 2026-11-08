# Развёртывание

Сборка `pnpm build` кладёт статический сайт в `dist/client`.

| Адрес | Как публикуется |
| --- | --- |
| https://vladplskv.github.io/tinnitusnotch/ | Вручную: workflow «Deploy static content to Pages» во вкладке Actions собирает `main` с `BASE_PATH=/tinnitusnotch/`. Пока его не запустили, там остаётся прежняя версия. |
| https://tinnitusnotch.vlad-plskv.workers.dev | Автоматически: Cloudflare Workers Builds после каждого merge в `main`. Для веток он публикует ссылки preview в PR. |
| https://tinnitusnotch-preview.vlad-plskv.workers.dev | Вручную: `pnpm deploy:preview` из рабочей копии, нужен `wrangler login`. |

Роутер берёт базовый путь из `import.meta.env.BASE_URL`, поэтому одна и та же сборка работает и в корне, и под `/tinnitusnotch/`.

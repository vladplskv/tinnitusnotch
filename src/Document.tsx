import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';

// Cloudflare Web Analytics counts only the production worker, so local dev,
// the preview worker and GitHub Pages stay out of the stats.
const ANALYTICS_HOST = 'tinnitusnotch.vlad-plskv.workers.dev';
const CF_BEACON_TOKEN = 'e7be3a04bf614e67b7c978786366f59f';
const analyticsScript = `if (location.hostname === ${JSON.stringify(ANALYTICS_HOST)}) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.dataset.cfBeacon = ${JSON.stringify(JSON.stringify({ token: CF_BEACON_TOKEN, spa: true }))};
  document.head.appendChild(s);
}`;

export default function Document(props: ParentProps) {
  return (
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <meta
          name="description"
          content="Подберите частоту своего шума в ушах и настройте звук для терапии."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Doto:wght@700..900&family=Onest:wght@300..700&display=swap"
        />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%231b1b1a'/%3E%3Cpath d='M10 32h8l5-13 9 28 8-21 5 12h9' fill='none' stroke='%23ff7f11' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        />
        <title>Tinnitus Notch: подбор частоты</title>
        <script innerHTML={analyticsScript} />
        <HydrationScript />
      </head>
      <body>
        <noscript>Для работы приложения нужен JavaScript.</noscript>
        {props.children}
      </body>
    </html>
  );
}

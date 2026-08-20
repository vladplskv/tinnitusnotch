import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';

export default function Document(props: ParentProps) {
  return (
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23111827'/%3E%3Cpath d='M10 32h8l5-13 9 28 8-21 5 12h9' fill='none' stroke='%23f5a623' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        />
        <title>Frequency Workspace</title>
        <HydrationScript />
      </head>
      <body class="dark">
        <noscript>Для работы приложения нужен JavaScript.</noscript>
        {props.children}
      </body>
    </html>
  );
}

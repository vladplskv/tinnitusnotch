import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';

export default function Document(props: ParentProps) {
  return (
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
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

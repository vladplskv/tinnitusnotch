import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <title>Tinnitus Notch App</title>
        <HydrationScript />
      </head>
      <body class="dark">
        <noscript>You need to enable JavaScript to run this app.</noscript>
        {props.children}
      </body>
    </html>
  );
}

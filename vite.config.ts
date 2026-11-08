import tailwindcss from '@tailwindcss/vite';
import * as process from 'node:process';
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    solid({ start: true, extensions: ['.tsx'] }),
    tailwindcss(),
    // ViteUmami({
    //     id: process.env.UMAMI_WEBSITE_ID!,
    //     src: process.env.UMAMI_SCRIPT_SRC!,
    // })
  ],
  server: {
    port: 3000,
  },
  build: {
    target: 'baseline-widely-available',
    // Keep images as asset files instead of inlining them into the JS bundle.
    assetsInlineLimit: 0,
  },
  resolve: {
    tsconfigPaths: true,
  },
});

import tailwindcss from '@tailwindcss/vite';
import * as process from 'node:process';
import {defineConfig} from 'vite';
import solidPlugin from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';
import ViteUmami from './umami.vite';

export default defineConfig({
	base: process.env.BASE_PATH ?? '/',
	plugins: [solidPlugin(), tailwindcss(), tsconfigPaths(), ViteUmami({
		id: process.env.UMAMI_WEBSITE_ID,
		src: process.env.UMAMI_SCRIPT_SRC,
	})],
	server: {
		port: 3000,
	},
	build: {
		target: 'esnext',
	},
});

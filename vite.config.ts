import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';
import solidPlugin from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	base: process.env.BASE_PATH ?? '/',
	plugins: [solidPlugin(), tailwindcss(), tsconfigPaths()],
	server: {
		port: 3000,
	},
	build: {
		target: 'esnext',
	},
});

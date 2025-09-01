import type {
	Plugin,
	ResolvedConfig,
} from 'vite';

export interface UmamiOption {
	id: string;
	src: string;
}

export interface ViteUmamiOptions extends UmamiOption {
	enableDev?: boolean;
}

export default function ViteUmami(opts: ViteUmamiOptions): Plugin {
	let viteConfig: ResolvedConfig;

	return {
		name: 'vite-umami',
		configResolved(config) {
			viteConfig = config;
		},
		transformIndexHtml() {
			if (viteConfig.command === 'serve' && !opts.enableDev)
				return [];

			return [{
				tag: 'script',
				attrs: {
					'async': true,
					'defer': true,
					'data-website-id': opts.id,
					'src': opts.src,
				},
			}];
		},
	};
}

import type {ParentProps} from 'solid-js';

export function AppLayout(props: ParentProps) {
	return (
		<div class="container max-w-2xl flex flex-col items-center gap-2 py-8 md:py-16 lg:py-20 xl:gap-4">
			{props.children}
		</div>
	)
}

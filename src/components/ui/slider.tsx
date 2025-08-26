import {Label} from '@/components/ui/label';

import {cn} from '@/lib/utils';

import type {PolymorphicProps} from '@kobalte/core/polymorphic';
import * as SliderPrimitive from '@kobalte/core/slider';
import {createSelection} from '@solid-primitives/selection';
import type {
	JSX,
	ValidComponent,
} from 'solid-js';
import {splitProps} from 'solid-js';

type SliderRootProps<T extends ValidComponent = 'div'> = SliderPrimitive.SliderRootProps<T> & {
	class?: string | undefined
}

const Slider = <T extends ValidComponent = 'div'>(
	props: PolymorphicProps<T, SliderRootProps<T>>,
) => {
	const [local, others] = splitProps(props as SliderRootProps, ['class']);
	return (
		<SliderPrimitive.Root
			class={cn('relative flex w-full touch-none select-none flex-col items-center', local.class)}
			{...others}
		/>
	);
};

type SliderTrackProps<T extends ValidComponent = 'div'> = SliderPrimitive.SliderTrackProps<T> & {
	class?: string | undefined
}

const SliderTrack = <T extends ValidComponent = 'div'>(
	props: PolymorphicProps<T, SliderTrackProps<T>>,
) => {
	const [local, others] = splitProps(props as SliderTrackProps, ['class']);
	return (
		<SliderPrimitive.Track
			class={cn('relative h-2 w-full grow rounded-full bg-secondary', local.class)}
			{...others}
		/>
	);
};

type SliderFillProps<T extends ValidComponent = 'div'> = SliderPrimitive.SliderFillProps<T> & {
	class?: string | undefined
}

const SliderFill = <T extends ValidComponent = 'div'>(
	props: PolymorphicProps<T, SliderFillProps<T>>,
) => {
	const [local, others] = splitProps(props as SliderFillProps, ['class']);
	return (
		<SliderPrimitive.Fill
			class={cn('absolute h-full rounded-full bg-primary', local.class)}
			{...others}
		/>
	);
};

type SliderThumbProps<T extends ValidComponent = 'span'> = SliderPrimitive.SliderThumbProps<T> & {
	class?: string | undefined
	children?: JSX.Element
}

const SliderThumb = <T extends ValidComponent = 'span'>(
	props: PolymorphicProps<T, SliderThumbProps<T>>,
) => {
	const [local, others] = splitProps(props as SliderThumbProps, ['class', 'children']);
	return (
		<SliderPrimitive.Thumb
			class={cn(
				'top-[-6px] block size-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
				local.class,
			)}
			{...others}
		>
			<SliderPrimitive.Input/>
		</SliderPrimitive.Thumb>
	);
};

const SliderLabel = <T extends ValidComponent = 'label'>(
	props: PolymorphicProps<T, SliderPrimitive.SliderLabelProps<T>>,
) => {
	return <SliderPrimitive.Label as={Label} {...props} />;
};

const SliderValueLabel = <T extends ValidComponent = 'label'>(
	props: PolymorphicProps<T, SliderPrimitive.SliderValueLabelProps<T>>,
) => {
	return <SliderPrimitive.ValueLabel as={Label} {...props} />;
};

const SliderInputLabel = () => {
	const sliderContext = SliderPrimitive.useSliderContext();
	const [selection, setSelection] = createSelection();

	return <span
		class="hover:border-border rounded-md border border-transparent px-2 py-0.5 text-right text-sm font-medium"
		contentEditable
		onInput={e => {
			const [node, start, end] = selection();
			if (e.currentTarget === node) {
				let value = Number.parseInt(e.target.textContent);
				value = Number.isNaN(value) ? 0 : value;

				const valueLength = value.toString().length;

				sliderContext.state.setValues([value]);
				node.innerText = value.toString();

				setSelection([node, Math.min(
					Number.isNaN(start) ? 1 : start + 1,
					valueLength,
				), Math.min(Number.isNaN(end) ? 1 : end + 1, valueLength)]);
			}

		}}>{sliderContext.state.values()[0]}</span>;
};

export {
	Slider,
	SliderTrack,
	SliderFill,
	SliderThumb,
	SliderLabel,
	SliderValueLabel,
	SliderInputLabel,
};

import { Label } from '@/components/ui/label';

import { cn } from '@/lib/utils';

import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as SliderPrimitive from '@kobalte/core/slider';
import { createSelection } from '@solid-primitives/selection';
import { omit, type ParentProps } from 'solid-js';
import type { ValidComponent } from '@solidjs/web';

type SliderRootProps<T extends ValidComponent = 'div'> =
  SliderPrimitive.SliderRootProps<T> & {
    class?: string | undefined;
  };

const Slider = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderRootProps<T>>,
) => {
  const others = omit(props as SliderRootProps, 'class');
  return (
    <SliderPrimitive.Root
      class={cn(
        'relative flex w-full touch-none flex-col items-center select-none',
        props.class,
      )}
      {...others}
    />
  );
};

type SliderTrackProps<T extends ValidComponent = 'div'> =
  SliderPrimitive.SliderTrackProps<T> & {
    class?: string | undefined;
  };

const SliderTrack = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderTrackProps<T>>,
) => {
  const others = omit(props as SliderTrackProps, 'class');
  return (
    <SliderPrimitive.Track
      class={cn(
        'bg-secondary relative h-2 w-full grow rounded-full',
        props.class,
      )}
      {...others}
    />
  );
};

type SliderFillProps<T extends ValidComponent = 'div'> =
  SliderPrimitive.SliderFillProps<T> & {
    class?: string | undefined;
  };

const SliderFill = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderFillProps<T>>,
) => {
  const others = omit(props as SliderFillProps, 'class');
  return (
    <SliderPrimitive.Fill
      class={cn('bg-primary absolute h-full rounded-full', props.class)}
      {...others}
    />
  );
};

type SliderThumbProps<T extends ValidComponent = 'span'> =
  SliderPrimitive.SliderThumbProps<T> &
    ParentProps & {
      class?: string | undefined;
    };

const SliderThumb = <T extends ValidComponent = 'span'>(
  props: PolymorphicProps<T, SliderThumbProps<T>>,
) => {
  const others = omit(props as SliderThumbProps, 'class', 'children');
  return (
    <SliderPrimitive.Thumb
      class={cn(
        'border-primary bg-background ring-offset-background focus-visible:ring-ring top-[-6px] block size-5 rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        props.class,
      )}
      {...others}
    >
      <SliderPrimitive.Input />
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

  return (
    <span
      class="hover:border-border rounded-md border border-transparent px-2 py-0.5 text-right text-sm font-medium"
      contenteditable
      onInput={e => {
        const [node, start, end] = selection();
        if (e.currentTarget === node) {
          let value = Number.parseInt(e.target.textContent);
          value = Number.isNaN(value) ? 0 : value;

          const valueLength = value.toString().length;

          sliderContext.state.setValues([value]);
          node.innerText = value.toString();

          setSelection([
            node,
            Math.min(Number.isNaN(start) ? 1 : start + 1, valueLength),
            Math.min(Number.isNaN(end) ? 1 : end + 1, valueLength),
          ]);
        }
      }}
    >
      {sliderContext.state.values()[0]}
    </span>
  );
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

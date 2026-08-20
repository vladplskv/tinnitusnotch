import { omit } from 'solid-js';
import { cn } from '@/lib/utils';
import type { ComponentProps } from '@solidjs/web';

export function Label(props: ComponentProps<'label'>) {
  const others = omit(props, 'class');

  return (
    <label
      class={cn(
        'text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        props.class,
      )}
      {...others}
    />
  );
}

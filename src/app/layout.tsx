import { useLocation } from '@solidjs/router';
import type { ParentProps } from 'solid-js';

export function AppLayout(props: ParentProps) {
  const location = useLocation();
  const isWhiteNoisePage = () =>
    location.pathname === '/' || location.pathname.startsWith('/white-noise');
  const isAMPage = () => location.pathname.startsWith('/am-therapy');

  return (
    <div class="w-full">
      <header class="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div class="container max-w-4xl py-4">
          <nav class="flex flex-wrap items-center gap-2">
            <a
              href="/white-noise"
              class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isWhiteNoisePage()
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              Терапия белым шумом
            </a>
            <a
              href="/am-therapy"
              class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isAMPage()
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              AM-терапия
            </a>
          </nav>
        </div>
      </header>
      <main class="container max-w-2xl py-8 md:py-12 lg:py-16">
        {props.children}
      </main>
    </div>
  );
}

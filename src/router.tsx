import FrequencyWorkspacePage from '@/features/frequency-workspace/ui/frequency-workspace-page';
import { createRouter, useNavigate } from '@solidjs/router';
import { onSettled } from 'solid-js';

function LegacyRouteRedirect() {
  const navigate = useNavigate();

  onSettled(() => {
    const suffix =
      typeof window === 'undefined'
        ? ''
        : `${window.location.search}${window.location.hash}`;
    navigate(`/${suffix}`, { replace: true });
  });

  return (
    <main class="grid min-h-dvh place-items-center p-6">
      <p class="text-muted-foreground text-sm">
        Открываем Frequency Workspace…
      </p>
    </main>
  );
}

export const Router = createRouter({
  routes: [
    {
      path: '/',
      component: FrequencyWorkspacePage,
    },
    {
      path: '/white-noise',
      component: LegacyRouteRedirect,
    },
    {
      path: '/am-therapy',
      component: LegacyRouteRedirect,
    },
  ],
});

export const { paths } = Router;

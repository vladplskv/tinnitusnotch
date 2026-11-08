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
      <p class="text-muted-foreground text-sm">Открываем приложение…</p>
    </main>
  );
}

export const Router = createRouter({
  /* GitHub Pages serves the app under /<repo>/ (BASE_PATH at build time). */
  base: import.meta.env.BASE_URL.replace(/\/$/, ''),
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

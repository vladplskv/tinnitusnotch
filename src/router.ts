import { createRouter } from '@solidjs/router';
import WhiteNoiseTherapyPage from '@/app/pages/white-noise-page';
import { AMTherapyPage } from '@/app/pages/am-therapy-page';

export const Router = createRouter({
  routes: [
    {
      path: '/',
      component: WhiteNoiseTherapyPage,
    },
    {
      path: '/white-noise',
      component: WhiteNoiseTherapyPage,
    },
    {
      path: '/am-therapy',
      component: AMTherapyPage,
    },
  ],
});

export const { paths } = Router;

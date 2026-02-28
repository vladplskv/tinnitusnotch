/* @refresh reload */
import './styles/globals.css';
import {AMTherapyPage} from '@/app/pages/am-therapy-page';
import {WhiteNoiseTherapyPage} from '@/app/pages/white-noise-page';
import {Route, Router} from '@solidjs/router';
import {render} from 'solid-js/web';

import {AppLayout} from './app/layout';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => (
	<Router root={AppLayout}>
		<Route path="/" component={WhiteNoiseTherapyPage}/>
		<Route path="/white-noise" component={WhiteNoiseTherapyPage}/>
		<Route path="/am-therapy" component={AMTherapyPage}/>
	</Router>
), root!);

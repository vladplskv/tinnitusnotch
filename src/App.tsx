import { Router } from './router';
import { AppLayout } from './app/layout';
import '@/styles/globals.css';

export default function App() {
  return <Router>{props => <AppLayout>{props.children}</AppLayout>}</Router>;
}

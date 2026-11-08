import { Router } from './router';
import '@/styles/globals.css';

export default function App() {
  return <Router>{props => props.children}</Router>;
}

import { renderToString } from 'react-dom/server';
import App from './App';
import './tokens.css';
import type { Commit } from './data';

// Server entry: pure render, no window/document/three/gsap at module scope.
// All browser-only work lives behind useEffect / dynamic import.
export function render(initialCommits: Commit[]): string {
  return renderToString(<App initialCommits={initialCommits} />);
}

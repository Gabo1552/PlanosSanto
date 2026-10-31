// Must stay first: runtime APIs for SketchUp 2022's Chromium 88 (see polyfills.ts).
import './polyfills';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
createRoot(document.getElementById('root')!).render(<App/>);

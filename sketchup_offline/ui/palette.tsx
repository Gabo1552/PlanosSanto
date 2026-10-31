// Must stay first: runtime APIs for SketchUp 2022's Chromium 88 (see polyfills.ts).
import './polyfills';
import {createRoot} from 'react-dom/client';
import StandalonePaintApp from './StandalonePaintApp';
document.body.classList.add('standalone-paint-body');
createRoot(document.getElementById('root')!).render(<StandalonePaintApp/>);

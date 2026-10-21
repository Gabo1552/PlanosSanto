import {createRoot} from 'react-dom/client';
import StandalonePaintApp from './StandalonePaintApp';
document.body.classList.add('standalone-paint-body');
createRoot(document.getElementById('root')!).render(<StandalonePaintApp/>);

import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import PieceViewer from '../../../sketchup_offline/ui/PieceViewer';
import {wardrobe,wardrobeRun} from '../../synthetic-furniture';

// Synthetic harness: the Muebles viewer with a placard (20 pieces) or a run of 20 placards (300 pieces).
function Harness(){
  const [furniture]=useState(()=>new URLSearchParams(location.search).get('model')==='run'?wardrobeRun():wardrobe());
  const [selected,setSelected]=useState<string>(),[highlight,setHighlight]=useState(false);
  return <main>
    <h1>Visor de muebles · {furniture.name}</h1>
    <button type="button" aria-pressed={highlight} onClick={()=>setHighlight(value=>!value)}>Resaltar pieza</button>
    <p data-testid="selected">{selected||'ninguna'}</p>
    <PieceViewer furniture={furniture} selected={selected} highlight={highlight} onSelect={setSelected}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);

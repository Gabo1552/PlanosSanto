export default function StartGuide({locked,onDemo}:{locked:boolean;onDemo:()=>void}){
  return <section className="start-guide">
    <div><span>01</span><h3>Subí tu ZIP</h3><p>Un solo archivo con las piezas de tu mueble.</p></div>
    <div><span>02</span><h3>Revisá y anotá</h3><p>Identificá las piezas y dejá instrucciones de armado.</p></div>
    <div><span>03</span><h3>Llevá tu guía al taller</h3><p>Una hoja A4 por mueble, con medidas y notas.</p></div>
    <button className="text-button" disabled={locked} onClick={onDemo}>Explorar proyecto DEMO →</button>
  </section>;
}

import Link from 'next/link';

export default function TopBar({locked,onDemo,onUpload}:{locked:boolean;onDemo:()=>void;onUpload:()=>void}){
  return <header className="topbar"><Link href="/" className="brand"><span className="brand-mark">S</span><span>PLANOS<span className="brand-light"> SANTO</span><small>DEL MODELO AL TALLER</small></span></Link>
    <div className="top-actions"><Link className="header-install" href="/instalar">Instalar extensión</Link><button className="button ghost" disabled={locked} onClick={onDemo}>Abrir demostración</button><button className="button dark" disabled={locked} onClick={onUpload}>↑ Subir archivo</button></div>
  </header>;
}

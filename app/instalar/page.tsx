import Link from 'next/link';
import release from '@/sketchup_offline/version.json';
export default function Install(){
  const {version}=release;
  return <main className="install-page">
    <Link href="/" className="install-back">← Volver a Planos Santo</Link>
    <div className="install-heading"><p className="eyebrow">SKETCHUP 2026 · VERSIÓN {version}</p><h1>Planos Santo en tu SketchUp.</h1><p>Prepará vistas, piezas, notas y PDF A4 dentro de SketchUp.</p></div>
    <div className="install-layout"><section className="install-steps">
      <article><span>1</span><div><h2>Descargá la versión actual</h2><p>Guardá <strong>PlanosSanto-{version}.rbz</strong> en Descargas. Se instala directamente, sin descomprimir. El ZIP de desarrollo no es el instalador.</p><a className="button dark" href="/api/extension/offline" download={`PlanosSanto-${version}.rbz`}>Descargar extensión para SketchUp</a></div></article>
      <article><span>2</span><div><h2>Instalala y reiniciá SketchUp</h2><p>Abrí <strong>Extensiones → Administrador de extensiones → Instalar extensión</strong> y elegí ese RBZ. Comprobá que figure <strong>Planos Santo {version}</strong> y esté habilitada.</p><p>Cerrá todas las ventanas de SketchUp y volvé a abrirlo para cargar la actualización.</p></div></article>
      <article><span>3</span><div><h2>Abrí Planos Santo</h2><p>Abrí una copia del modelo. Elegí <strong>Extensiones → Planos Santo → Planos Santo</strong>, revisá los muebles y pulsá <strong>Generar guías</strong>.</p><p>Después podés guardar anotaciones y exportar el PDF A4.</p></div></article>
    </section><aside className="install-help"><h2>¿No aparece en Extensiones?</h2><p>Buscala primero en el <strong>Administrador de extensiones</strong>. Si no figura, no quedó registrada: volvé a instalar el RBZ descargado arriba.</p><p>Si figura deshabilitada, habilitala y reiniciá SketchUp. Si indica que está bloqueada, copiá el motivo; no cambies una política administrada.</p><p>Si figura habilitada pero sigue sin aparecer al reiniciar, abrí <strong>Ventana → Consola Ruby</strong> y conservá el error de carga. La versión {version} también avisa si encuentra archivos faltantes o un error al iniciar.</p><p>Esta versión todavía no fue ejecutada dentro de SketchUp 2026 Windows.</p><details><summary>¿Usabas el ZIP para la web?</summary><p>Ese flujo utiliza el exportador anterior. Ambos instaladores comparten el mismo nombre y se reemplazan al instalar; no los alternes sin reiniciar.</p><Link href="/instalar/web">Instalar exportador 0.3 para subir ZIP →</Link></details></aside></div>
  </main>;
}

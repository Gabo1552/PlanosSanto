import release from '../version.json';
import {request} from './bridge';

type RuntimeDiagnostic={extensionVersion?:unknown};
export function assertRuntimeVersion(diagnostic:RuntimeDiagnostic){
  if(diagnostic.extensionVersion!==release.version){
    const loaded=typeof diagnostic.extensionVersion==='string'?diagnostic.extensionVersion:'desconocida';
    throw new Error(`Actualización pendiente: la ventana es ${release.version}, pero SketchUp sigue usando la versión ${loaded}. Cerrá todas las ventanas de SketchUp y volvé a abrirlo. No se guardaron cambios desde esta operación. Si tenés indicaciones nuevas sin guardar, copialas antes de reiniciar.`);
  }
}
export async function ensureRuntime(){assertRuntimeVersion(await request<RuntimeDiagnostic>('diagnostic'));}

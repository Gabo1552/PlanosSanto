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

// ARQ-06: the first open is fitted to 80 % of the available screen by SketchUp;
// later opens keep the size the operator left. Older runtimes may lack it.
export async function fitWindowOnce(){
  const screen=typeof window!=='undefined'?window.screen:undefined;
  if(!screen||!(screen.availWidth>0)||!(screen.availHeight>0))return;
  try{await request('window_fit',{screenWidth:Math.round(screen.availWidth),screenHeight:Math.round(screen.availHeight)});}
  catch{/* the window keeps its remembered size */}
}
export async function setWindowFolded(folded:boolean){
  const result=await request<{folded?:unknown}>('window_fold',{folded});
  return result?.folded===true;
}

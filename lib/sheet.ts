import {pieceCodeMap} from './pieceGroups';
import type { Furniture } from './model';

/** One legend shared by both projections; numbers refer to the same local anchors. */
export function sheetEntries(f:Furniture):string[]{
  const codes=pieceCodeMap(f);
  const notes=f.notes.map((n,i)=>`${i+1} · ${codes.get(n.pieceId)||'?'} · ${n.text}`);
  const warningCodes=new Map<string,Set<string>>();
  for(const p of f.pieces)for(const warning of p.warnings){
    const ids=warningCodes.get(warning)||new Set<string>();ids.add(codes.get(p.id)||p.code);warningCodes.set(warning,ids);
  }
  const warnings=[...warningCodes].map(([warning,ids])=>`${[...ids].join(', ')}: ${warning}`);
  if(f.presentation?.guide){
    const guide=f.presentation.guide;
    return [...(f.groupIdentical?['ID compartido: piezas de la misma definición, medidas y material. × en la vista indica instancias visibles; cantidad total en la tabla.']:[]),...notes,...warnings,...(guide.hiddenPieceIds.length&&guide.mode!=='exterior'?['Las piezas ocultas en la vista interior permanecen incluidas en el listado.']:[]),...(guide.observations.trim()?[`Observaciones de armado: ${guide.observations.trim()}`]:[]),...(!notes.length&&!warnings.length?['Guía de armado · medidas en mm · no medir a escala.']:[])];
  }
  return [...(f.presentation?.compact?[f.presentation?.hideIds?'Plano compacto: cotas por referencia de ID de la tabla; IDs ocultos en las vistas.':'Plano compacto: cotas por referencia de ID; una etiqueta por tipo en la trasera (× cantidad).']:[]),...(f.groupIdentical?['ID compartido: piezas iguales de la misma definición, medidas y material; cantidad en la tabla.']:[]),...notes,...warnings,...(!notes.length&&!warnings.length?[f.presentation?.hideIds?'IDs ocultos en el dibujo. Códigos y medidas en la tabla. Despiece ilustrativo: no medir a escala.':f.presentation?.compact?'Cotas en la delantera; espesor en la tabla. Despiece ilustrativo: no medir a escala.':'Mismos códigos en ambas vistas. Cotas en la delantera; espesor en la tabla. Despiece ilustrativo: no medir a escala.']:[])];
}

import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {PDFDocument} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {box} from '../lib/demo';
import {createA4Demo} from '../lib/a4Demo';
import {identity,importDocument,type Furniture,type RawDocument,type RawNode} from '../lib/model';
import {makeScene,sheetView} from '../lib/scene';
import {dimensionChoices,dimensionMarkHitsRect,dimensionText,isDimensionNotice,setDimensionVisible,type Dimension} from '../lib/dimensions';
import {a4Furniture,a4ViewScene,composeA4,createOfflinePdfPages,metricFont} from '../sketchup_offline/ui/pdf';

const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
const board=(id:string,name:string,size:[number,number,number],pos:[number,number,number]):RawNode=>({id,name,kind:'component',definition:size.join('x'),transform:new Matrix4().makeTranslation(...pos).toArray(),mesh:box(...size),children:[]});
/** SINTÉTICO, parecido al banco 1200 × 450 × 450 del taller: dos laterales iguales, piso y zócalo. */
export function banco(piso=1164):Furniture{
  const doc:RawDocument={version:1,units:'mm',name:'Banco sintético',furniture:[{id:'banco',name:'Banco',kind:'group',transform:identity(),children:[
    board('b-lat-izq','Lateral izquierdo',[18,450,450],[0,0,0]),board('b-lat-der','Lateral derecho',[18,450,450],[1182,0,0]),
    board('b-piso','Piso',[piso,450,18],[18,0,80]),board('b-zocalo','Zócalo',[1164,18,80],[18,0,0]),
  ]}]};
  const f=importDocument(doc,'demo').furniture[0];
  f.presentation={guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}};
  return f;
}
const direction=(f:Furniture,d:Dimension)=>{const piece=f.pieces.find(p=>p.id===d.pieceId)!,m=new Matrix4().fromArray(piece.transform);return new Vector3(...d.localEnd).applyMatrix4(m).sub(new Vector3(...d.localStart).applyMatrix4(m)).normalize();};
/** Every visible cota is drawn, or another drawn cota prints the same text along the same direction. */
function covered(f:Furniture,dimensions:Dimension[]){
  const scene=makeScene(f,{layout:'sheet'}),all=dimensionChoices(f).filter(c=>c.visible);
  for(const choice of all){
    if(dimensions.some(d=>d.pieceId===choice.pieceId&&d.role===choice.role))continue;
    const piece=f.pieces.find(p=>p.id===choice.pieceId)!,lengths=[0,1,2].map(i=>piece.dimensions[i]);
    expect(lengths).toContain(choice.valueMm);
    expect(dimensions.some(d=>d.shared?.includes(choice.code)&&d.text===dimensionText(choice.valueMm)),`${choice.code} ${choice.role} sin cota equivalente`).toBe(true);
  }
  return scene;
}

describe('Cotas iguales: una sola por medida y dirección',()=>{
  it('acota una vez lo que se repite en el banco y conserva las medidas distintas',()=>{
    const f=banco(),before=JSON.stringify(f);
    for(const view of ['front','back'] as const){
      const scene=makeScene(f,{view,layout:'sheet'});
      expect(scene.warnings).toEqual([]);
      expect(scene.dimensions.map(d=>d.valueMm).sort((a,b)=>a-b)).toEqual([80,450,450,1164]);
      // Los dos 450 del lateral son alto y profundidad: direcciones distintas, se dibujan los dos.
      const lateral=scene.dimensions.filter(d=>d.valueMm===450);
      expect(Math.abs(direction(f,lateral[0]).dot(direction(f,lateral[1])))).toBeLessThan(.01);
      expect(scene.dimensions.find(d=>d.valueMm===1164)!.shared).toEqual([scene.dimensions.find(d=>d.valueMm===1164)!.code==='P03'?'P04':'P03']);
      covered(f,scene.dimensions);
    }
    expect(JSON.stringify(f)).toBe(before);
  });
  it('no omite una medida distinta aunque esté dentro de 0,5 mm, y absorbe el ruido numérico',()=>{
    const distinct=makeScene(banco(1164.4),{layout:'sheet'});
    expect(distinct.dimensions.map(d=>d.text)).toEqual(expect.arrayContaining(['1164 mm','1164,4 mm']));
    const noise=makeScene(banco(1164+1e-7),{layout:'sheet'});
    expect(noise.dimensions.filter(d=>d.text==='1164 mm')).toHaveLength(1);
  });
  it('ocultar la cota que representa a otras deja ver la equivalente',()=>{
    const f=banco(),scene=makeScene(f,{layout:'sheet'}),depth=scene.dimensions.find(d=>d.valueMm===450&&d.shared?.length)!;
    f.hiddenDimensions=setDimensionVisible(f,depth.pieceId,depth.role,false);
    const after=makeScene(f,{layout:'sheet'});
    expect(after.dimensions.some(d=>d.pieceId===depth.pieceId&&d.role===depth.role)).toBe(false);
    expect(after.dimensions.filter(d=>d.valueMm===450)).toHaveLength(2);
  });
});

describe('Solapes de cotas resueltos solos',()=>{
  it('una cota movida sobre las marcas de otra se corre al lugar libre más cercano',()=>{
    const f=banco(),scene=makeScene(f,{layout:'sheet'}),{width,height}=sheetView(f);
    const moved=scene.dimensions[0],other=scene.dimensions.find(d=>d!==moved&&d.segments.some(s=>s.kind==='tick'))!;
    const tick=other.segments.find(s=>s.kind==='tick')!,target={x:(tick.a.x+tick.b.x)/2,y:(tick.a.y+tick.b.y)/2};
    f.presentation!.dimensionOffsets=[{pieceId:moved.pieceId,role:moved.role,view:'front',offset:[(target.x-moved.label.center.x)/width,(target.y-moved.label.center.y)/height]}];
    const changed=makeScene(f,{layout:'sheet'}),updated=changed.dimensions.find(d=>d.pieceId===moved.pieceId&&d.role===moved.role)!;
    expect(changed.warnings).toEqual([]);
    for(const d of changed.dimensions)for(const o of changed.dimensions)if(d!==o)for(const s of d.segments)expect(dimensionMarkHitsRect(s,o.label.rect,1)).toBe(false);
    // Queda cerca de donde se soltó, no vuelve a su lugar automático.
    expect(Math.hypot(updated.label.center.x-target.x,updated.label.center.y-target.y)).toBeLessThan(Math.hypot(moved.label.center.x-target.x,moved.label.center.y-target.y));
  });
  it('sin ningún lugar libre la cota se imprime igual, marcada, con un aviso que no bloquea la hoja',async()=>{
    // 17 piezas SINTÉTICAS con los IDs a la vista y tres notas: una cota no tiene lugar libre en esta cámara.
    // 0.8.29: las vistas son más grandes; sin notas todas las cotas encuentran lugar, por eso se agregan tres.
    const project=createA4Demo(),f=project.furniture[0];f.zoom=1;f.presentation!.hideIds=false;f.presentation!.cameras={front:{yaw:-20,pitch:45}};
    f.notes=f.pieces.slice(0,3).map((piece,i)=>({id:`n${i}`,pieceId:piece.id,anchor:[9,100,100],position:[0,0],text:'Encolar'}));
    const {bytes,pages}=await createOfflinePdfPages(project,regular,mono);
    expect(bytes.length).toBeGreaterThan(0);
    expect(pages[0].notices?.join(' ')).toMatch(/^Vista exterior: Cotas sin lugar libre: P\d+ (largo|ancho): queda superpuesta.*Se imprimen igual/);
    const printed=composeA4(project,f,{regular:metricFont(regular),mono:metricFont(mono)}),scene=printed.scenes[0].scene;
    const flagged=scene.dimensions.filter(d=>d.issue);
    expect(flagged.length).toBeGreaterThan(0);
    expect(scene.warnings.filter(w=>!isDimensionNotice(w))).toEqual([]);
    // Las demás cotas siguen sin tapar marcas ajenas.
    for(const d of scene.dimensions.filter(d=>!d.issue))for(const o of scene.dimensions.filter(o=>o!==d&&!o.issue))for(const s of d.segments)expect(dimensionMarkHitsRect(s,o.label.rect,1)).toBe(false);
  });
});

describe('Visor del editor igual a la hoja A4',()=>{
  it('mide el texto con la misma aritmética que el PDF',async()=>{
    const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
    const embedded={regular:await pdf.embedFont(regular,{subset:true}),mono:await pdf.embedFont(mono,{subset:true})},metrics={regular:metricFont(regular),mono:metricFont(mono)};
    for(const text of ['Observaciones de armado: verificar escuadra.','ID compartido: piezas de la misma definición','1164 mm','ÁÉÍÓÚ ñ × · « » —','P01'])for(const size of [7,8,9,13])for(const kind of ['regular','mono'] as const)
      expect(metrics[kind].widthOfTextAtSize(text,size)).toBe(embedded[kind].widthOfTextAtSize(text,size));
    expect(metrics.regular.getCharacterSet()).toEqual(embedded.regular.getCharacterSet());
  });
  it.each(['both','exterior','interior'] as const)('compone la misma escena que imprime el PDF: %s',async mode=>{
    const f=banco();f.presentation!.guide!.mode=mode;f.presentation!.guide!.observations='Pegar y atornillar los laterales al piso. '.repeat(3);
    f.notes=[{id:'n1',pieceId:f.pieces[2].id,anchor:[500,200,18],position:[0,0],text:'Encolar'}];
    const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
    const embedded={regular:await pdf.embedFont(regular,{subset:true}),mono:await pdf.embedFont(mono,{subset:true})},metrics={regular:metricFont(regular),mono:metricFont(mono)};
    const printed=composeA4({name:'Banco'},f,embedded);
    for(const {view,scene} of printed.scenes){
      const viewer=a4ViewScene(f,view,metrics);
      expect([viewer.width,viewer.height]).toEqual([scene.width,scene.height]);
      expect(viewer.height).not.toBe(sheetView(a4Furniture(f)).height);
      expect(JSON.stringify({d:viewer.dimensions,l:viewer.labels,n:viewer.notes,f:viewer.faces})).toBe(JSON.stringify({d:scene.dimensions,l:scene.labels,n:scene.notes,f:scene.faces}));
      // IDs ocultos por defecto en la hoja y en el visor.
      expect(scene.labels).toEqual([]);
    }
    f.presentation!.hideIds=false;
    expect(composeA4({name:'Banco'},f,embedded).scenes[0].scene.labels.length).toBeGreaterThan(0);
    expect(a4ViewScene(f,printed.scenes[0].view,metrics).labels.length).toBeGreaterThan(0);
  });
});

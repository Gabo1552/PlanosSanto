import {z} from 'zod';
import {MAX_FURNITURE} from './model';

/**
 * «Paquete de obra» (planos-santo.obra.v1): lo que App Santo necesita para el visor 3D del avance de obra.
 * Cada pieza es una caja orientada: `caja` (límites en sus ejes locales, mm) y `transform` (matriz mundo 4×4,
 * column-major como three.js `Matrix4.fromArray`, traslación en mm). Sin mallas, para que el archivo quede
 * liviano. El `nombre` del mueble es el mismo texto de la columna «Mueble» del CSV de Piezas. Contrato
 * documentado en docs/integracion-app-santo/OBRA_JSON.md.
 */
export const OBRA_SCHEMA='planos-santo.obra.v1';
/** Piezas por mueble: el mismo tope que la exportación de guías (Exporter#document). */
export const OBRA_MAX_PIECES=500;
/** Tope del archivo; una cocina de 30 muebles ronda los 0,5 MB. */
export const OBRA_MAX_BYTES=16*1024*1024;

const number=z.number().finite();
const vec3=z.tuple([number,number,number]);
const positive=number.positive().max(100000);
const text=(max:number)=>z.string().max(max);
const transform=z.array(number).length(16)
  .refine(m=>Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])<1e-8&&Math.abs(m[15]-1)<1e-8,'Transformación no afín.');
const caja=z.object({min:vec3,max:vec3}).strict().refine(b=>b.min.every((v,i)=>v<=b.max[i]),'Caja con mínimo mayor que el máximo.');
const material=z.object({nombre:text(200).min(1),sku:text(160).nullable(),color:z.string().regex(/^#[0-9a-f]{6}$/).nullable()}).strict();
const pieza=z.object({
  id:text(1000).min(1),codigo:text(40),nombre:text(200),material,
  medidas:z.tuple([positive,positive,positive]),caja,transform,
}).strict();
const mueble=z.object({
  id:text(1000).min(1),nombre:text(120).min(1),codigo:text(10),
  medidas:z.object({alto:number.nonnegative(),ancho:number.nonnegative(),profundidad:number.nonnegative()}).strict(),
  piezas:z.array(pieza).min(1).max(OBRA_MAX_PIECES),
}).strict();
export const obraSchema=z.object({
  schema:z.literal(OBRA_SCHEMA),version:z.string().regex(/^\d+\.\d+\.\d+$/),modelo:text(200),exportado:z.iso.datetime(),unidades:z.literal('mm'),
  muebles:z.array(mueble).min(1).max(MAX_FURNITURE),
}).strict().superRefine((obra,ctx)=>{
  const furniture=new Set<string>(),pieces=new Set<string>();
  for(const m of obra.muebles){
    if(furniture.has(m.id))ctx.addIssue({code:'custom',message:`Mueble repetido: ${m.id}.`});
    furniture.add(m.id);
    for(const p of m.piezas){
      if(pieces.has(p.id))ctx.addIssue({code:'custom',message:`Pieza repetida: ${p.id}.`});
      pieces.add(p.id);
    }
  }
});
export type Obra=z.infer<typeof obraSchema>;
export type ObraMueble=Obra['muebles'][number];
export type ObraPieza=ObraMueble['piezas'][number];
export const parseObra=(raw:unknown):Obra=>obraSchema.parse(raw);

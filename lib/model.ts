import {groupedNameIssues} from './pieceGroups';
import type {PieceNaming} from './naming';
import {presentationSchema,type Presentation} from './presentation';
import { z } from 'zod';
import { Box3, Matrix4, Vector3 } from 'three';

export type Vec3 = [number, number, number];
const number = z.number().finite();
const vec3 = z.tuple([number, number, number]);
const matrix = z.array(number).length(16);
const materialSchema = z.object({id:z.string().max(200),name:z.string().max(200),color:vec3,opacity:number.min(0).max(1),textured:z.boolean()});
const metadataSchema = z.object({
  persistentId:z.string().max(100),instancePath:z.array(z.string().max(100)).max(25),
  originalName:z.string().max(1000),nameBase:z.string().max(80).optional(),definitionName:z.string().max(1000),
  hidden:z.boolean(),effectiveVisible:z.boolean(),tag:z.string().max(200),
  material:materialSchema.nullable(),worldTransform:matrix,
  localBounds:z.object({min:vec3,max:vec3}).optional(),
  dimensionsMm:vec3.optional(),rectangular:z.boolean().optional(),warnings:z.array(z.string().max(500)).max(100),errors:z.array(z.string().max(500)).max(100).optional(),
});
const meshSchema = z.object({
  vertices: z.array(vec3).min(4).max(100000),
  triangles: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()])).min(1).max(200000),
  faceMaterials:z.array(z.object({front:materialSchema.nullable(),back:materialSchema.nullable()})).max(200000).optional(),
});
export type Mesh = z.infer<typeof meshSchema>;
export type NodeMetadata=z.infer<typeof metadataSchema>;
export type RawNode = { id: string; name: string; kind: 'group' | 'component'; definition?: string; transform: number[]; mesh?: Mesh; metadata?:NodeMetadata; children: RawNode[] };
const rawNode: z.ZodType<RawNode> = z.lazy(() => z.object({
  id: z.string().min(1).max(1000), name: z.string().max(120), kind: z.enum(['group', 'component']),
  definition: z.string().max(200).optional(), transform: matrix, mesh: meshSchema.optional(), children: z.array(rawNode).max(500),
  metadata:metadataSchema.optional(),
}));
export const rawDocumentSchema = z.object({
  version: z.literal(1), units: z.enum(['mm', 'in']), name: z.string().min(1).max(120),
  furniture: z.array(rawNode).min(1).max(100),
  exporter:z.object({name:z.literal('Planos Santo Ruby'),version:z.enum(['0.2.0','0.3.0','0.4.0','0.4.1','0.4.2','0.4.3','0.4.4','0.5.0','0.5.1','0.5.2','0.5.3','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.7.0','0.7.1','0.7.2','0.7.3','0.7.4','0.7.5','0.8.0','0.8.1','0.8.2','0.8.3','0.8.4','0.8.5','0.8.6','0.8.7','0.8.8','0.8.9','0.8.10','0.8.11','0.8.12']),sketchupVersion:z.string().max(100),modelGuid:z.string().min(1).max(200),modelName:z.string().max(200),exportedAt:z.iso.datetime(),selectionPaths:z.array(z.string()).min(1).max(100),reviewed:z.literal(true),warnings:z.array(z.string().max(500)).max(500)}).optional(),
});
export type RawDocument = z.infer<typeof rawDocumentSchema>;
export type Piece = { id: string; code: string; name: string; definition?: string; mesh: Mesh; transform: number[]; dimensions: Vec3; quantity: 1; warnings: string[]; metadata?:NodeMetadata };
export const noteSchema = z.object({
  id: z.uuid(), pieceId: z.string().min(1).max(1000), anchor: vec3,
  position: z.tuple([number.min(16).max(734), number.min(22).max(528)]),
  text: z.string().trim().min(1).max(200),
});
export type Note = z.infer<typeof noteSchema>;
export const hiddenDimensionSchema=z.object({pieceId:z.string().min(1).max(1000),role:z.enum(['largo','ancho'])}).strict();
export const hiddenDimensionsSchema=z.array(hiddenDimensionSchema).max(1000).refine(rows=>new Set(rows.map(r=>JSON.stringify([r.pieceId,r.role]))).size===rows.length,'Cotas ocultas duplicadas.');
export type HiddenDimension=z.infer<typeof hiddenDimensionSchema>;
export type Furniture = { referenceTransform?:number[]; groupIdentical?:boolean; groupName?:string; id: string; name: string; pieces: Piece[]; notes: Note[]; hiddenDimensions?:HiddenDimension[]; presentation?:Presentation; naming?:PieceNaming; explosion: number; zoom: number };
export type Project = { id: string; name: string; source: 'demo' | 'skp' | 'sketchup-ruby'; createdAt: string; updatedAt: string; revision: number; furniture: Furniture[]; importedDocument?:RawDocument };
export const editSchema = z.object({
  revision: z.number().int().nonnegative(),
  furniture: z.array(z.object({
    id: z.string(), explosion: number.min(0).max(1), zoom: number.min(0.35).max(1.4),
    pieces: z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(80) })).max(500),
    notes: z.array(noteSchema).max(40),
    hiddenDimensions:hiddenDimensionsSchema.optional(),presentation:presentationSchema.optional(),groupIdentical:z.boolean().optional(),
  })).max(100),
}).strict();
export type Edit = z.infer<typeof editSchema>;
export const identity = () => new Matrix4().toArray();
export const bounds = (mesh: Mesh) => new Box3().setFromPoints(mesh.vertices.map(v => new Vector3(...v)));

export class ModelValidationError extends Error {}
export function importDocument(raw: unknown, source: Project['source']): Project {
  const doc = rawDocumentSchema.parse(raw);
  const units = doc.units === 'in' ? 25.4 : 1;
  const seen = new Set<string>();
  let totalVertices = 0;
  let totalTriangles=0;
  function validateNode(node: RawNode, depth: number) {
    if (depth > 24) throw new Error('El anidamiento supera 24 niveles.');
    if (seen.has(node.id)) throw new Error('Cada instancia debe tener un identificador único.');
    seen.add(node.id);
    const m = node.transform;
    if (Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]) > 1e-8 || Math.abs(m[15] - 1) > 1e-8) throw new Error('Transformación no afín.');
    if (node.mesh) {
      if(node.mesh.faceMaterials && node.mesh.faceMaterials.length!==node.mesh.triangles.length)throw new ModelValidationError('Los materiales no corresponden a los triángulos.');
      if(node.metadata?.errors?.length)throw new ModelValidationError(node.metadata.errors.join(' '));
      totalVertices += node.mesh.vertices.length;
      totalTriangles+=node.mesh.triangles.length;
      if (totalVertices > 200000) throw new Error('El modelo supera 200.000 vértices.');
      if(totalTriangles>200000)throw new ModelValidationError('El modelo supera 200.000 triángulos.');
      for (const tri of node.mesh.triangles) {
        if (tri.some(i => i >= node.mesh!.vertices.length) || new Set(tri).size !== 3) throw new Error('Índices de geometría inválidos.');
        const [a,b,c] = tri.map(i => new Vector3(...node.mesh!.vertices[i]));
        if (b.sub(a).cross(c.sub(a)).length() < 1e-10) throw new Error('La geometría contiene triángulos degenerados.');
      }
    }
    node.children.forEach(child => validateNode(child, depth + 1));
  }
  doc.furniture.forEach(n => validateNode(n, 0));
  const furniture = doc.furniture.map(root => {
    const pieces: Piece[] = [];
    function visit(node: RawNode, parent: Matrix4, depth: number) {
      const world = parent.clone().multiply(new Matrix4().fromArray(node.transform));
      if (node.mesh) {
        const axes = [0,1,2].map(i => new Vector3().setFromMatrixColumn(world, i));
        const scales = axes.map(a => a.length());
        if (scales.some(s => s < 1e-8)) throw new Error('Una pieza tiene escala cero.');
        if (axes.some((a,i) => axes.some((b,j) => i !== j && Math.abs(a.dot(b) / scales[i] / scales[j]) > 1e-5))) throw new Error('Transformación sesgada: no se pueden garantizar medidas ortogonales.');
        const mesh: Mesh = { vertices: node.mesh.vertices.map(v => v.map(x => x * units) as Vec3), triangles: node.mesh.triangles, ...(node.mesh.faceMaterials?{faceMaterials:node.mesh.faceMaterials}:{}) };
        const size = bounds(mesh).getSize(new Vector3()).toArray().map((v,i) => v * scales[i]).sort((a,b) => b - a) as Vec3;
        if (size.some(v => v < 0.01 || v > 100000)) throw new Error('Dimensiones fuera de rango (0,01–100.000 mm).');
        const transform = world.toArray();
        [12,13,14].forEach(i => { transform[i] *= units; });
        const warnings: string[] = [];
        if(node.metadata){
          warnings.push(...node.metadata.warnings.filter(w=>!(w.startsWith('Instancia sin nombre:')&&node.metadata!.definitionName.trim())));
          if(!node.metadata.effectiveVisible)warnings.push('Pieza oculta o en etiqueta no visible: incluida para revisión.');
          if(node.metadata.dimensionsMm?.some((n,i)=>Math.abs(n-size[i])>0.1))throw new ModelValidationError('Las medidas declaradas por la extensión difieren de la geometría.');
          if(node.metadata.rectangular===false)warnings.push('Forma no rectangular: medidas de caja local; verificar en SketchUp.');
        }
        if (size[2] / size[1] > 0.2) warnings.push('Confirmar orientación: la geometría no parece un tablón fino.');
        if (Math.abs(size[0] - size[1]) < 0.1) warnings.push('Largo y ancho equivalentes; se informan ejes locales ordenados.');
        if (node.children.length) warnings.push('Grupo con geometría propia y subgrupos: revisar clasificación.');
        pieces.push({ id: node.id, code: `P${String(pieces.length + 1).padStart(2, '0')}`, name: node.name.trim() || `Pieza ${pieces.length+1}`, definition: node.definition, mesh, transform, dimensions: size, quantity: 1, warnings:[...new Set(warnings)],...(node.metadata?{metadata:node.metadata}:{}) });
      }
      node.children.forEach(child => visit(child, world, depth + 1));
    }
    visit(root, new Matrix4(), 0);
    if (!pieces.length) throw new Error(`El mueble «${root.name}» no tiene piezas con geometría.`);
    if (pieces.length > 500) throw new Error('Un mueble supera 500 piezas. Separá el modelo.');
    const referenceTransform=[...root.transform];[12,13,14].forEach(i=>{referenceTransform[i]*=units;});
    return { id: root.id, referenceTransform, name: (root.name||'').trim() || 'Mueble sin nombre', pieces, notes: [], explosion: 0.45, zoom: 1 };
  });
  const date = new Date().toISOString();
  return { id: crypto.randomUUID(), name: doc.name, source, createdAt: date, updatedAt: date, revision: 0, furniture, ...(source==='sketchup-ruby'?{importedDocument:doc}:{}) };
}

export function applyEdit(project: Project, input: unknown): Project {
  const edit = editSchema.parse(input);
  if (edit.revision !== project.revision) throw new Error('CONFLICT');
  if (edit.furniture.length !== project.furniture.length || new Set(edit.furniture.map(f => f.id)).size !== edit.furniture.length) throw new Error('No se puede alterar la estructura del modelo.');
  const result = structuredClone(project);
  for (const patch of edit.furniture) {
    const f = result.furniture.find(f => f.id === patch.id);
    if (!f || patch.pieces.length !== f.pieces.length || new Set(patch.pieces.map(p => p.id)).size !== patch.pieces.length) throw new Error('Piezas inconsistentes.');
    for (const piece of patch.pieces) {
      const p = f.pieces.find(p => p.id === piece.id);
      if (!p) throw new Error('Pieza desconocida.');
      p.name = piece.name;
    }
    if (new Set(patch.notes.map(n => n.id)).size !== patch.notes.length) throw new Error('Notas duplicadas.');
    for (const note of patch.notes) {
      const p = f.pieces.find(p => p.id === note.pieceId);
      if (!p || !bounds(p.mesh).expandByScalar(0.01).containsPoint(new Vector3(...note.anchor))) throw new Error('El ancla está fuera de la pieza.');
    }
    if(patch.hiddenDimensions!==undefined){
      if(patch.hiddenDimensions.some(ref=>!f.pieces.some(p=>p.id===ref.pieceId)))throw new Error('Una cota oculta apunta a una pieza desconocida.');
      f.hiddenDimensions=patch.hiddenDimensions;
    }
    if(patch.presentation!==undefined){
      if(patch.presentation.guide?.hiddenPieceIds.some(id=>!f.pieces.some(p=>p.id===id)))throw new Error('Una pieza oculta apunta a una ruta de instancia desconocida.');
      if(patch.presentation.dimensionOffsets?.some(ref=>!f.pieces.some(p=>p.id===ref.pieceId)))throw new Error('Una cota movida apunta a una pieza desconocida.');
      f.presentation=patch.presentation;
    }
    if(patch.groupIdentical!==undefined)f.groupIdentical=patch.groupIdentical;
    if(groupedNameIssues(f).length)throw new Error(groupedNameIssues(f).join(' '));
    f.notes = patch.notes;
    f.explosion = patch.explosion;
    f.zoom = patch.zoom;
  }
  result.revision++;
  result.updatedAt = new Date().toISOString();
  return result;
}
export function toEdit(p: Project): Edit {
  return { revision: p.revision, furniture: p.furniture.map(f => ({ id: f.id, explosion: f.explosion, zoom: f.zoom, pieces: f.pieces.map(p => ({ id: p.id, name: p.name })), groupIdentical:f.groupIdentical||false, hiddenDimensions:f.hiddenDimensions||[], presentation:f.presentation||{}, notes: f.notes })) };
}
export const mm = (n: number) => Number(n.toFixed(2)).toLocaleString('es-AR', { maximumFractionDigits: 2 });

import { z } from 'zod';
export const cameraSchema=z.object({yaw:z.number().finite().min(-180).max(180),pitch:z.number().finite().min(10).max(80)}).strict();
export type CameraAngles=z.infer<typeof cameraSchema>;
const offsetSchema=z.object({pieceId:z.string().min(1).max(1000),role:z.enum(['largo','ancho']),view:z.enum(['front','back']),offset:z.tuple([z.number().finite().min(-1).max(1),z.number().finite().min(-1).max(1)])}).strict();
export const presentationSchema=z.object({
  guide:z.object({mode:z.enum(['exterior','interior','both']),hiddenPieceIds:z.array(z.string().min(1).max(1000)).max(500).refine(ids=>new Set(ids).size===ids.length,'Piezas ocultas duplicadas.'),sharedCamera:z.boolean(),observations:z.string().max(2000)}).strict().optional(),
  cameras:z.object({front:cameraSchema.optional(),back:cameraSchema.optional()}).strict().optional(),
  hideIds:z.boolean().optional(),
  compact:z.boolean().optional(),
  dimensionOffsets:z.array(offsetSchema).max(2000).refine(rows=>new Set(rows.map(r=>JSON.stringify([r.pieceId,r.role,r.view]))).size===rows.length,'Cotas movidas duplicadas.').optional(),
}).strict();
export type Presentation=z.infer<typeof presentationSchema>;
export const defaultCamera:CameraAngles={yaw:0,pitch:Math.atan(.85/Math.SQRT2)*180/Math.PI};

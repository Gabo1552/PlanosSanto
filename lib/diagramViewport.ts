import type {makeScene} from './scene';

/** Crop unused editor space without changing scene coordinates or the printed plan. */
export function diagramViewport(scene:ReturnType<typeof makeScene>){
  // Notes can be dragged across the editor. Reserve their whole coordinate
  // space so dragging never moves or rescales the viewport under the pointer.
  if(scene.notes.length)return `0 0 ${scene.width} ${scene.height}`;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  function point(x:number,y:number){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  function rect(r:{x:number;y:number;w:number;h:number}){point(r.x,r.y);point(r.x+r.w,r.y+r.h);}
  scene.faces.forEach(face=>face.points.split(' ').forEach(pair=>{const [x,y]=pair.split(',').map(Number);point(x,y);}));
  scene.labels.forEach(label=>{rect(label);point(label.anchor.x,label.anchor.y);});
  scene.notes.forEach(note=>{rect(note.rect);point(note.target.x,note.target.y);});
  scene.dimensions.forEach(dimension=>{
    rect(dimension.label.rect);
    dimension.segments.forEach(segment=>{point(segment.a.x,segment.a.y);point(segment.b.x,segment.b.y);});
  });
  if(!Number.isFinite(minX))return `0 0 ${scene.width} ${scene.height}`;
  return `${minX-30} ${minY-30} ${Math.max(80,maxX-minX+60)} ${Math.max(80,maxY-minY+60)}`;
}

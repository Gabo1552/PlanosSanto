import {describe,it,expect} from 'vitest';
import {createDemo} from '../lib/demo';
import {Matrix4} from 'three';
import {orbitCamera} from '../components/ViewAdjustments';
import {frontCamera,guideCamera,markedFront,makeScene} from '../lib/scene';
import {defaultCamera} from '../lib/presentation';
import {ensureGuide} from '../sketchup_offline/ui/GuideViews';

describe('Controles de cámara de guía A4',()=>{
  it('migra sin alterar geometría, medidas, nombres, notas ni configuración anterior',()=>{
    const before=createDemo().furniture[0];before.presentation={hideIds:true,cameras:{front:{yaw:22,pitch:38}}};
    const original=structuredClone(before),migrated=ensureGuide(before);
    expect(before).toEqual(original);
    expect(migrated.presentation).toEqual({...original.presentation,guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}});
    expect(migrated.pieces).toBe(before.pieces);expect(migrated.notes).toBe(before.notes);
    expect(ensureGuide(migrated)).toBe(migrated);
  });
  it('gira ambas orientaciones desde interior cuando la cámara es compartida',()=>{
    const f=ensureGuide(createDemo().furniture[0]);f.presentation!.cameras={front:{yaw:30,pitch:40},back:{yaw:140,pitch:70}};
    const before=JSON.stringify(f),p=orbitCamera(f,'back',[25,10]);
    expect(p.cameras!.front).toEqual({yaw:40,pitch:37});
    // The interior keeps looking from the opposite side.
    expect(p.cameras!.back).toEqual({yaw:-140,pitch:37});
    expect(JSON.stringify(f)).toBe(before);
  });
  it('conserva cámaras independientes al desactivar compartir y conserva el comportamiento legado',()=>{
    const f=ensureGuide(createDemo().furniture[0]);f.presentation!.guide!.sharedCamera=false;f.presentation!.cameras={front:{yaw:30,pitch:40},back:{yaw:140,pitch:70}};
    expect(orbitCamera(f,'back',[25,10]).cameras).toEqual({front:{yaw:30,pitch:40},back:{yaw:150,pitch:67}});
    delete f.presentation!.guide;
    expect(orbitCamera(f,'back',[25,10]).cameras).toEqual({front:{yaw:30,pitch:40},back:{yaw:150,pitch:67}});
  });
  // Planos: the front marked in Muebles («Proponer nombres») orients the guide by itself.
  it('orienta el exterior al frente marcado y el interior desde el lado opuesto, sin guardar cámaras',()=>{
    const f=ensureGuide(createDemo().furniture[0]),pitch=defaultCamera.pitch;
    expect(markedFront(f)).toBeUndefined();expect(guideCamera(f,'front')).toEqual(defaultCamera);expect(guideCamera(f,'back')).toEqual({yaw:-180,pitch});
    f.naming={moduleCode:'',bases:[],reference:{upAxis:2,frontAxis:0,frontSign:1,confirmed:false}};expect(frontCamera(f)).toEqual(defaultCamera);
    f.naming.reference!.confirmed=true;expect(guideCamera(f,'front')).toEqual({yaw:90,pitch});expect(guideCamera(f,'back')).toEqual({yaw:-90,pitch});
    f.naming.reference={upAxis:2,frontAxis:1,frontSign:-1,confirmed:true};expect(frontCamera(f)).toEqual(defaultCamera);
    // A group turned 90° keeps its local front: −Y local looks along +X in the model.
    f.referenceTransform=new Matrix4().makeRotationZ(Math.PI/2).toArray();expect(frontCamera(f)).toEqual({yaw:90,pitch});
    const exterior=makeScene(f),scene=makeScene({...f,presentation:{...f.presentation,cameras:{front:{yaw:90,pitch}}}});
    expect(exterior.camera.forward.distanceTo(scene.camera.forward)).toBeLessThan(1e-9);expect(f.presentation?.cameras).toBeUndefined();
    f.presentation!.cameras={front:{yaw:12,pitch:30}};expect(guideCamera(f,'front')).toEqual({yaw:12,pitch:30});expect(guideCamera(f,'back')).toEqual({yaw:-168,pitch:30});
    f.presentation!.guide!.sharedCamera=false;expect(guideCamera(f,'back')).toEqual({yaw:-90,pitch});
  });
});

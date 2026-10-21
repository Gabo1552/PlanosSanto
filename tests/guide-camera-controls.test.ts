import {describe,it,expect} from 'vitest';
import {createDemo} from '../lib/demo';
import {orbitCamera} from '../components/ViewAdjustments';
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
    expect(p.cameras!.back).toEqual(p.cameras!.front);
    expect(JSON.stringify(f)).toBe(before);
  });
  it('conserva cámaras independientes al desactivar compartir y conserva el comportamiento legado',()=>{
    const f=ensureGuide(createDemo().furniture[0]);f.presentation!.guide!.sharedCamera=false;f.presentation!.cameras={front:{yaw:30,pitch:40},back:{yaw:140,pitch:70}};
    expect(orbitCamera(f,'back',[25,10]).cameras).toEqual({front:{yaw:30,pitch:40},back:{yaw:150,pitch:67}});
    delete f.presentation!.guide;
    expect(orbitCamera(f,'back',[25,10]).cameras).toEqual({front:{yaw:30,pitch:40},back:{yaw:150,pitch:67}});
  });
});

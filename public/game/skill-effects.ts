import * as T from './vendor/three.module.js';
import {SKILLS} from './skills.js';
import type {EventPayloads,PublicMob} from '../../shared/types.js';

/** Short, pooled effects use authoritative impact events, never predict damage. */
export function createSkillEffects(scene:T.Scene){
  const ringGeometry=new T.RingGeometry(.86,1,56),arcGeometry=new T.RingGeometry(.72,1,32,1,-.78,1.56);
  const effects=Array.from({length:24},()=>{
    const material=new T.MeshBasicMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
    const mesh=new T.Mesh(ringGeometry,material);mesh.rotation.x=-Math.PI/2;mesh.visible=false;mesh.userData.dynamic=true;mesh.renderOrder=2;scene.add(mesh);
    return {mesh,age:0,duration:.5,radius:1,active:false};
  });
  const slowRings=new Map<number,T.Mesh<T.RingGeometry,T.MeshBasicMaterial>>();
  let cursor=0;
  return {
    impact(event:EventPayloads['skillImpact']){
      const effect=effects[cursor++%effects.length],skill=SKILLS[event.skillId];
      effect.age=0;effect.duration=event.skillId==='mage-frost'?.65:.42;effect.radius=skill.radius??(skill.classId==='archer'?.6:skill.range);effect.active=true;
      effect.mesh.geometry=event.skillId==='warrior-cleave'?arcGeometry:ringGeometry;
      effect.mesh.material.color.set(event.skillId==='mage-fireball'?'#ff8d41':event.skillId==='mage-frost'?'#91dfff':skill.classId==='archer'?'#d2e7a7':'#ffd8a0');
      effect.mesh.position.set(event.x,.065,event.z);effect.mesh.rotation.set(-Math.PI/2,0,Math.PI/2-event.yaw);effect.mesh.visible=true;
    },
    slowMobs(mobs:PublicMob[]){for(const mob of mobs){let ring=slowRings.get(mob.id);if(!ring&&mob.slow){ring=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({color:'#87d6ef',transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.scale.setScalar(.55);scene.add(ring);slowRings.set(mob.id,ring);}if(ring){ring.visible=(mob.slow||0)>0&&mob.state!=='dead';ring.position.set(mob.x,.055,mob.z);ring.material.opacity=Math.min(.3,(mob.slow||0)*.3);}}},
    update(dt:number){for(const effect of effects){if(!effect.active)continue;effect.age+=dt;const phase=Math.min(1,effect.age/effect.duration);effect.mesh.scale.setScalar(effect.radius*(.2+.8*(1-(1-phase)**3)));effect.mesh.material.opacity=(1-phase)*.6;if(phase===1){effect.active=false;effect.mesh.visible=false;}}},
  };
}

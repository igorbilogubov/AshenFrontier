import * as T from './vendor/three.module.js';
import type {PublicPlayer,PublicMob,SkillZone} from '../../shared/types.js';

/** Server-owned lifetimes, bounded reusable meshes. No particle lights or timers per actor. */
export function createPersistentSkillEffects(scene:T.Scene){
  const ringGeometry=new T.TorusGeometry(1,.025,4,48),sphereGeometry=new T.SphereGeometry(1,12,8),crystalGeometry=new T.OctahedronGeometry(.28),planeGeometry=new T.PlaneGeometry(.65,.9),poleGeometry=new T.CylinderGeometry(.025,.04,1.9,6),beamGeometry=new T.CylinderGeometry(1,1,1,6);
  const slots=Array.from({length:64},()=>{
    const root=new T.Group();root.visible=false;root.userData.dynamic=true;scene.add(root);
    const material=new T.MeshBasicMaterial({color:'#8bd5e8',transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide});
    const ring=new T.Mesh(ringGeometry,material.clone());ring.rotation.x=-Math.PI/2;root.add(ring);
    const shell=new T.Mesh(sphereGeometry,material.clone());root.add(shell);
    const crystal=new T.Mesh(crystalGeometry,material.clone());root.add(crystal);
    const pole=new T.Mesh(poleGeometry,material.clone());root.add(pole);
    const flag=new T.Mesh(planeGeometry,material.clone());root.add(flag);
    return {root,ring,shell,crystal,pole,flag};
  });
  const beams=Array.from({length:12},()=>{const root=new T.Group();root.visible=false;scene.add(root);const outer=new T.Mesh(beamGeometry,new T.MeshBasicMaterial({color:'#9274ef',transparent:true,opacity:.3,depthWrite:false,blending:T.AdditiveBlending})),core=new T.Mesh(beamGeometry,new T.MeshBasicMaterial({color:'#ded6ff',transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending}));root.add(outer,core);return {root,outer,core};});
  const a=new T.Vector3(),b=new T.Vector3(),direction=new T.Vector3(),up=new T.Vector3(0,1,0);let used=0,beamsUsed=0;
  function place(skill:string,x:number,z:number,radius:number,remaining:number,time:number,zone:boolean){
    if(used>=slots.length)return;const s=slots[used++];s.root.visible=true;s.root.position.set(x,.06,z);s.root.rotation.set(0,0,0);
    const shield=skill==='mage-mana-shield',smoke=skill==='archer-smoke',banner=skill==='warrior-banner',source=skill==='mage-mana-source',trap=skill==='archer-trap',ice=skill==='mage-ice-step',red=skill==='warrior-berserk';
    const color=smoke?'#767d77':red?'#d54733':ice||shield?'#85d9ef':source?'#9aa9f5':trap?'#a7b2aa':skill.startsWith('warrior')?'#dcc89c':'#adceb4';
    const fade=Math.min(1,Math.max(0,remaining));
    for(const part of [s.ring,s.shell,s.crystal,s.pole,s.flag]){part.visible=false;part.material.color.set(color);part.material.opacity=.5*fade;part.rotation.set(0,0,0);part.scale.setScalar(1);part.position.set(0,0,0);}
    s.ring.visible=true;s.ring.rotation.x=-Math.PI/2;s.ring.scale.setScalar(zone?radius:.62);s.ring.material.opacity=(zone?.3:.22)*fade;
    if(shield||smoke){s.shell.visible=true;s.shell.position.y=shield?1:.1;s.shell.scale.set(shield?.68:radius,shield?1.05:.55,shield?.68:radius);s.shell.material.wireframe=shield;s.shell.material.opacity=(shield?.14:.12)*fade;}
    if(source||ice){s.crystal.visible=true;s.crystal.position.y=source?.55:.12;s.crystal.rotation.set(0,time*.8,source?0:Math.PI/4);s.crystal.scale.setScalar(source?1.2:.7);s.crystal.material.opacity=.7*fade;}
    if(banner){s.pole.visible=s.flag.visible=true;s.pole.position.y=.9;s.pole.material.opacity=.9*fade;s.flag.position.set(.32,1.45,0);s.flag.rotation.y=.2*Math.sin(time*3);s.flag.material.opacity=.75*fade;}
    if(trap){s.ring.scale.setScalar(.45);s.ring.rotation.x=-Math.PI/3;s.ring.material.opacity=.85*fade;s.crystal.visible=true;s.crystal.scale.set(1.7,.16,1.7);s.crystal.position.y=.04;s.crystal.material.opacity=.6*fade;}
    if(!zone&&!shield){s.crystal.visible=true;s.crystal.position.set(Math.sin(time*1.5)*.55,.9+Math.sin(time*2)*.07,Math.cos(time*1.5)*.55);s.crystal.scale.setScalar(.3);s.crystal.material.opacity=.5*fade;}
  }
  return {
    sync(players:readonly PublicPlayer[],mobs:readonly PublicMob[],zones:readonly SkillZone[],time:number){
      used=0;beamsUsed=0;
      for(const zone of zones)place(zone.skillId,zone.x,zone.z,zone.radius,zone.remaining,time,true);
      for(const player of players){
        if(player.dead)continue;
        for(const effect of player.effects??[])place(effect.skillId,player.x,player.z,.7,effect.remaining,time,false);
        const attack=player.attack;if(attack?.skillId!=='mage-beam'||beamsUsed>=beams.length)continue;
        const mob=mobs.find(m=>m.id===attack.targetId&&m.state!=='dead');
        const target=mob??attack.target;if(!target)continue;
        const beam=beams[beamsUsed++];a.set(player.x,1.24,player.z);b.set(target.x,.8,target.z);direction.subVectors(b,a);const length=direction.length();
        beam.root.visible=true;beam.root.position.copy(a).addScaledVector(direction,.5);beam.root.quaternion.setFromUnitVectors(up,direction.normalize());
        const pulse=1+.08*Math.sin(time*22);beam.outer.scale.set(.11*pulse,length,.11*pulse);beam.core.scale.set(.025,length,.025);
      }
      for(let i=used;i<slots.length;i++)slots[i].root.visible=false;for(let i=beamsUsed;i<beams.length;i++)beams[i].root.visible=false;
    },
    clear(){for(const s of slots)s.root.visible=false;for(const b of beams)b.root.visible=false;used=beamsUsed=0;},
    stats(){return {capacity:slots.length,active:used,beamCapacity:beams.length,beams:beamsUsed};},
    dispose(){for(const s of slots){s.root.removeFromParent();for(const m of [s.ring,s.shell,s.crystal,s.pole,s.flag])m.material.dispose();}for(const b of beams){b.root.removeFromParent();b.outer.material.dispose();b.core.material.dispose();}for(const g of [ringGeometry,sphereGeometry,crystalGeometry,planeGeometry,poleGeometry,beamGeometry])g.dispose();}
  };
}

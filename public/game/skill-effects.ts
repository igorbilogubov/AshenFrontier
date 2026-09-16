import * as T from './vendor/three.module.js';
import {SKILLS} from './skills.js';
import type {EventPayloads,PublicMob,Point} from '../../shared/types.js';

type ImpactEvent=EventPayloads['skillImpact'];
const COLORS:Record<string,string>={'warrior-cleave':'#ffe3ac','warrior-whirlwind':'#eac083','warrior-thrust':'#fff5d0','warrior-shockwave':'#e7a25b','archer-piercing':'#fff0a6','archer-volley':'#b8e29c','archer-frost-shot':'#91e5ff','archer-rain':'#d4edaa','mage-fireball':'#ff9b3e','mage-frost':'#a5e9ff','mage-lightning':'#c9c0ff','mage-meteor':'#ff793c'};
Object.assign(COLORS,{'warrior-heavy':'#ffe4b4','warrior-bleed':'#d95643','warrior-charge':'#e5c28c','warrior-leap':'#cfb28f','warrior-guard':'#a4c0d3','warrior-berserk':'#dc5942','warrior-shout':'#ead4a1','warrior-banner':'#d0c596','archer-aimed':'#ffeaa2','archer-poison':'#87d456','archer-retreat':'#bfceb3','archer-roll':'#b9c7a6','archer-trap':'#afbba6','archer-focus':'#dddfa1','archer-wind':'#b2dfca','archer-smoke':'#85968a','mage-ice-lance':'#8ad7f1','mage-beam':'#ba9ffa','mage-teleport':'#c6afff','mage-ice-step':'#a6ebee','mage-mana-shield':'#8dbfe9','mage-seals':'#cabaf5','mage-ward':'#a8c0ec','mage-mana-source':'#8fb7f1'});
const POOL_SIZE=32,PARTICLES=24;
/** Bounded, reusable geometry; every impact/telegraph starts from a server event.
 * Cosmetic debris never determines a hit or changes the server's warning delay. */
export function createSkillEffects(scene:T.Scene){
  const ringGeometry=new T.RingGeometry(.92,1,48),arcGeometry=new T.RingGeometry(.72,1,32,1,-.78,1.56),waveGeometry=new T.RingGeometry(.88,1,24,1,-.36,.72),sphereGeometry=new T.IcosahedronGeometry(1,1);
  const effects=Array.from({length:POOL_SIZE},()=>{
    const root=new T.Group();root.visible=false;root.userData.dynamic=true;scene.add(root);
    const material=new T.MeshBasicMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
    const ring=new T.Mesh(ringGeometry,material);ring.rotation.x=-Math.PI/2;ring.renderOrder=2;root.add(ring);
    const core=new T.Mesh(sphereGeometry,material.clone());core.visible=false;root.add(core);
    const positions=new Float32Array(PARTICLES*3),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    const sparks=new T.Points(geometry,new T.PointsMaterial({size:.10,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));sparks.frustumCulled=false;root.add(sparks);
    const lines=new Float32Array(PARTICLES*6),lineGeometry=new T.BufferGeometry();lineGeometry.setAttribute('position',new T.BufferAttribute(lines,3));
    const streaks=new T.LineSegments(lineGeometry,new T.LineBasicMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending}));streaks.frustumCulled=false;root.add(streaks);
    return {root,ring,core,sparks,streaks,positions,lines,age:0,duration:.5,radius:1,active:false,skill:'',warning:false,seed:0,fromX:0,fromZ:0};
  });
  const slowRings=new Map<number,T.Mesh<T.RingGeometry,T.MeshBasicMaterial>>();let cursor=0;
  function sample(effect:typeof effects[number]){
    const p=T.MathUtils.clamp(effect.age/effect.duration,0,1),out=1-p,exp=1-out*out*out,skill=effect.skill,r=effect.radius;
    const lightning=skill==='mage-lightning'||skill==='mage-beam',rain=skill==='archer-rain',meteor=skill==='mage-meteor',ice=skill==='mage-frost'||skill==='archer-frost-shot'||skill==='mage-ice-lance'||skill==='mage-ice-step';
    effect.ring.scale.setScalar(r*(effect.warning?1:.22+.78*exp));effect.ring.material.opacity=effect.warning?.18+.14*Math.sin(p*16)**2:out*.65;
    effect.core.visible=meteor||skill==='mage-fireball';effect.core.scale.setScalar(effect.warning?.3:(meteor?.7:.48)*(.3+exp));effect.core.position.set(effect.warning?-1.6*(1-p):0,effect.warning?.3+6*(1-p):.42,0);effect.core.material.opacity=out*.85;
    if(effect.warning&&!rain){effect.sparks.visible=false;effect.streaks.visible=false;return;}
    effect.sparks.visible=!effect.warning;effect.streaks.visible=true;effect.sparks.material.opacity=out*.9;effect.streaks.material.opacity=effect.warning?.65:out*.8;
    effect.sparks.material.size=meteor?.15:ice?.12:.075;
    for(let i=0;i<PARTICLES;i++){
      const angle=i*2.399963+effect.seed*.17,spread=.28+((i*13)%23)/23*.72,travel=r*spread*exp;
      let x=Math.sin(angle)*travel,z=Math.cos(angle)*travel,y=.12+Math.sin(Math.PI*p)*(ice?.65:meteor?1.8:.85)*spread;
      let dx=-Math.sin(angle)*.13*out,dz=-Math.cos(angle)*.13*out,dy=.12*out;
      if(rain){const progress=effect.warning?p:1;x=Math.sin(angle)*r*spread;z=Math.cos(angle)*r*spread;y=.07+(1-progress)*4;dx=-.12;dy=.65;dz=0;}
      if(lightning){const q=i/PARTICLES,next=(i+1)/PARTICLES,a=i===0?0:out,b=i+1===PARTICLES?0:out;x=effect.fromX*(1-q)+Math.sin(i*19+effect.seed)*.2*a;z=effect.fromZ*(1-q)+Math.cos(i*13)*.12*a;y=1.05+Math.sin(i*17)*.16*a;dx=effect.fromX*(1-next)+Math.sin((i+1)*19+effect.seed)*.2*b-x;dz=effect.fromZ*(1-next)+Math.cos((i+1)*13)*.12*b-z;dy=Math.sin((i+1)*17)*.16*b+1.05-y;}
      if(skill==='warrior-thrust'){x=Math.sin(angle)*.09;z=r*(i/PARTICLES)*exp;y=.8+Math.cos(angle)*.13;dx=0;dz=.4*out;dy=0;}
      if(skill==='warrior-heavy'||skill==='warrior-bleed'){const a=-1+i/(PARTICLES-1)*2;x=Math.sin(a)*r*.45;y=.15+Math.cos(a)*r*exp;z=.25+exp*.35;dx=0;dy=-.28*out;dz=0;}
      if(skill==='warrior-cleave'){const a=-.78+i/(PARTICLES-1)*1.56;x=Math.sin(a)*r*exp;z=Math.cos(a)*r*exp;y=.5+.3*Math.sin(i/PARTICLES*Math.PI);dx=-.12*Math.cos(a);dz=.12*Math.sin(a);dy=0;}
      if(skill==='warrior-shockwave'){const a=-.36+i/(PARTICLES-1)*.72;x=Math.sin(a)*travel;z=Math.cos(a)*travel;y=.06+Math.sin(p*Math.PI)*.48*spread;dx=0;dz=0;dy=.38*out;}
      const a=i*3,b=i*6;effect.positions[a]=x;effect.positions[a+1]=y;effect.positions[a+2]=z;effect.lines[b]=x;effect.lines[b+1]=y;effect.lines[b+2]=z;effect.lines[b+3]=x+dx;effect.lines[b+4]=y+dy;effect.lines[b+5]=z+dz;
    }
    effect.sparks.geometry.attributes.position.needsUpdate=true;effect.streaks.geometry.attributes.position.needsUpdate=true;
  }
  return {
    impact(event:ImpactEvent,elapsedSeconds=0){
      const effect=effects[cursor++%effects.length],skill=SKILLS[event.skillId];if(!skill||event.phase==='end')return;
      effect.age=Math.max(0,elapsedSeconds);effect.warning=event.phase==='warning';effect.skill=event.skillId;effect.seed=event.attackId;
      effect.duration=effect.warning?Math.max(.05,event.delay??.5):event.skillId==='mage-lightning'?.3:event.skillId==='archer-rain'?.55:event.skillId==='mage-meteor'?.8:.55;
      effect.radius=event.radius??skill.radius??(skill.kind==='mobility'?1:skill.kind!=='attack'&&skill.kind!=='channel'?1.2:skill.classId==='archer'||skill.classId==='mage'?.6:skill.range);effect.active=true;
      effect.root.position.set(event.x,.065,event.z);effect.root.rotation.y=event.yaw;effect.root.visible=true;
      const dx=(event.from?.x??event.x)-event.x,dz=(event.from?.z??event.z)-event.z;
      effect.fromX=dx*Math.cos(event.yaw)-dz*Math.sin(event.yaw);effect.fromZ=dx*Math.sin(event.yaw)+dz*Math.cos(event.yaw);
      effect.ring.geometry=event.skillId==='warrior-cleave'?arcGeometry:event.skillId==='warrior-shockwave'?waveGeometry:ringGeometry;
      effect.ring.rotation.set(-Math.PI/2,0,event.skillId.startsWith('warrior-')?-Math.PI/2:0);effect.ring.visible=event.skillId!=='mage-lightning'&&event.skillId!=='mage-beam'&&event.skillId!=='warrior-thrust';
      for(const material of [effect.ring.material,effect.core.material,effect.sparks.material,effect.streaks.material])material.color.set(COLORS[event.skillId]||'#ffffff');
      sample(effect);
      if(effect.age>=effect.duration){effect.active=false;effect.root.visible=false;}
    },
    slowMobs(mobs:PublicMob[]){
      const present=new Set(mobs.map(mob=>mob.id));for(const [id,ring]of slowRings)if(!present.has(id)){ring.removeFromParent();ring.material.dispose();slowRings.delete(id);}
      for(const mob of mobs){let ring=slowRings.get(mob.id);if(!ring&&mob.slow){ring=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({color:'#87d6ef',transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.scale.setScalar(.55);scene.add(ring);slowRings.set(mob.id,ring);}if(ring){ring.visible=(mob.slow||0)>0&&mob.state!=='dead';ring.position.set(mob.x,.055,mob.z);ring.material.opacity=Math.min(.3,(mob.slow||0)*.3);}}
    },
    update(dt:number){for(const effect of effects){if(!effect.active)continue;effect.age+=Math.max(0,dt);if(effect.age>=effect.duration){effect.active=false;effect.root.visible=false;}else sample(effect);}},
    clear(){for(const effect of effects){effect.active=false;effect.root.visible=false;}for(const ring of slowRings.values())ring.visible=false;},
    stats(){return {capacity:POOL_SIZE,active:effects.filter(effect=>effect.active).length,particleCapacity:POOL_SIZE*PARTICLES,slowRings:slowRings.size};},
    dispose(){for(const effect of effects){effect.root.removeFromParent();effect.ring.material.dispose();effect.core.material.dispose();effect.sparks.geometry.dispose();effect.sparks.material.dispose();effect.streaks.geometry.dispose();effect.streaks.material.dispose();}for(const ring of slowRings.values()){ring.removeFromParent();ring.material.dispose();}slowRings.clear();ringGeometry.dispose();arcGeometry.dispose();waveGeometry.dispose();sphereGeometry.dispose();},
  };
}

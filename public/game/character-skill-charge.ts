import * as T from './vendor/three.module.js';
import type {WarriorPose} from './render-types.js';
import {SKILLS} from './skills.js';

/** One small reusable emitter per actor; no lights or allocation on combat frames. */
export function createCharacterSkillCharge(model:T.Object3D){
  const hand=model.getObjectByName('mixamorigRightHand')||model.getObjectByName('mixamorig:RightHand');
  const root=new T.Group();root.name='Skill_Charge';root.visible=false;model.add(root);
  const core=new T.Mesh(new T.IcosahedronGeometry(.14,1),new T.MeshBasicMaterial({color:'#ffb568',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.6}));root.add(core);
  const positions=new Float32Array(54),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const points=new T.Points(geometry,new T.PointsMaterial({color:'#ffcf8a',size:.045,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));points.frustumCulled=false;root.add(points);
  const ring=new T.Mesh(new T.RingGeometry(.8,1,32),new T.MeshBasicMaterial({color:'#ffe4a1',side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));ring.rotation.x=-Math.PI/2;root.add(ring);
  const center=new T.Vector3();
  return {update(hero:WarriorPose){
    const attack=hero.attack,skill:string=attack?.skillId||'';root.visible=!!attack&&!hero.dead&&!!skill&&!skill.startsWith('archer');if(!root.visible||!attack||!attack.skillId)return;
    const contact=SKILLS[attack.skillId].hitFraction,p=T.MathUtils.clamp(attack.age/attack.duration,0,1),charge=T.MathUtils.smoothstep(p,0,contact),fade=1-T.MathUtils.smoothstep(p,contact,Math.min(1,contact+.16)),power=charge*fade;
    root.visible=power>.01;if(!root.visible)return;
    const frost=skill==='mage-frost',lightning=skill==='mage-lightning',meteor=skill==='mage-meteor',warrior=skill.startsWith('warrior');
    const color=frost?'#8edfff':lightning?'#c8b9ff':warrior?'#ffe2a0':'#ffa35a';
    model.updateWorldMatrix(true,true);if(hand)model.worldToLocal(hand.getWorldPosition(center));else center.set(0,1.1,0);
    if(meteor)center.set(0,2.55,0);if(frost)center.set(0,1.1,0);
    root.position.copy(center);core.material.color.set(color);points.material.color.set(color);ring.material.color.set(color);
    core.visible=!warrior;core.scale.setScalar((meteor?2:frost?1.7:1)*(.25+power));core.material.opacity=power*.6;core.rotation.set(p*6,p*8,0);
    ring.visible=frost||meteor||skill==='warrior-shockwave';ring.scale.setScalar((frost?.8:meteor?.5:.38)*power);ring.rotation.z=p*4;ring.material.opacity=power*.55;
    points.material.opacity=power*.85;
    for(let i=0;i<18;i++){const angle=i*2.4+p*10,radius=(warrior?.18:.4)*(.2+((i*7)%17)/17)*(1-.6*charge),a=i*3;positions[a]=Math.sin(angle)*radius;positions[a+1]=Math.cos(angle*1.7)*radius;positions[a+2]=Math.cos(angle)*radius;}
    geometry.attributes.position.needsUpdate=true;
  },dispose(){root.removeFromParent();core.geometry.dispose();core.material.dispose();geometry.dispose();points.material.dispose();ring.geometry.dispose();ring.material.dispose();}};
}

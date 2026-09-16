import * as T from './vendor/three.module.js';
import {SKILLS} from './skills.js';
import type {WarriorPose} from './render-types.js';

// Mixamo hand space is centimetres: Y follows the metacarpals, Z is the
// palm normal. The source bow's metal grip is at (0, 0, 12), not at its origin.
export const BOW_GRIP=Object.freeze({x:0,y:7,z:2});
const sourceGrip=new T.Vector3(0,0,12);

/** Bind the authored rigid bow to the palm; string and arrow use this same socket. */
export function createBowPresentation(model:T.Object3D){
  const left=model.getObjectByName('mixamorigLeftHand')||model.getObjectByName('mixamorig:LeftHand'),right=model.getObjectByName('mixamorigRightHand')||model.getObjectByName('mixamorig:RightHand');
  const ranger=model.getObjectByName('ranger-bow'),sentinel=model.getObjectByName('sentinel-bow');
  if(!left||!right||!ranger)return {update(_hero:WarriorPose,_dt=1/60){},dispose(){}};
  const ownedGeometry:T.BufferGeometry[]=[];
  const lateBows:T.Object3D[]=[];model.traverse(o=>{if(o.userData.lateBow)lateBows.push(o);});
  const bows=[ranger,...sentinel?[sentinel]:[],...lateBows];
  for(const bow of bows){
    const primitives:T.SkinnedMesh[]=[];bow.traverse(o=>{if(o instanceof T.SkinnedMesh)primitives.push(o);});
    for(const primitive of primitives){
      const index=primitive.skeleton.bones.findIndex(bone=>bone===left);if(index<0)continue;
      // These accessories are rigid (all weights LeftHand). Recover their
      // original bone-local vertices once; do not transform an already posed skin.
      const geometry=primitive.geometry.clone().applyMatrix4(primitive.bindMatrix).applyMatrix4(primitive.skeleton.boneInverses[index]);
      geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');ownedGeometry.push(geometry);
      const rigid=new T.Mesh(geometry,primitive.material);rigid.name=primitive.name;
      rigid.castShadow=primitive.castShadow;rigid.receiveShadow=primitive.receiveShadow;rigid.frustumCulled=false;
      const materials=Array.isArray(primitive.material)?primitive.material:[primitive.material];
      rigid.visible=!materials.some(material=>material.name==='Linen_Bowstring');
      primitive.removeFromParent();bow.add(rigid);
    }
    left.add(bow);bow.position.set(0,0,0);bow.rotation.set(0,0,0);bow.scale.setScalar(1);
  }
  const points=new Float32Array(9),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(points,3));
  const string=new T.Line(geometry,new T.LineBasicMaterial({color:'#cbb78c'}));string.name='Bow_DynamicString';string.frustumCulled=false;model.add(string);
  const arrowMaterial=new T.MeshStandardMaterial({color:'#a9956e',roughness:.75}),tipMaterial=new T.MeshStandardMaterial({color:'#bcc2b3',metalness:.5,roughness:.4});
  const arrow=new T.Mesh(new T.CylinderGeometry(.006,.006,1,5),arrowMaterial);arrow.name='Bow_NockedArrow';arrow.castShadow=false;model.add(arrow);
  const tip=new T.Mesh(new T.ConeGeometry(.024,.10,4),tipMaterial);tip.position.y=.5;arrow.add(tip);
  const fanArrows=[arrow.clone(),arrow.clone()];fanArrows.forEach((extra,i)=>{extra.name=`Bow_FanArrow_${i}`;extra.visible=false;model.add(extra);});
  const glow=new T.Mesh(new T.OctahedronGeometry(.085),new T.MeshBasicMaterial({color:'#ebd98d',transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending}));glow.name='Bow_SkillCharge';glow.visible=false;model.add(glow);
  const a=new T.Vector3(),b=new T.Vector3(),nock=new T.Vector3(),grip=new T.Vector3(),direction=new T.Vector3(),up=new T.Vector3(0,1,0),rightLocal=new T.Vector3(),offset=new T.Vector3();
  let drawWeight=0,drawAngle=-Math.PI/2;
  return {dispose(){geometry.dispose();string.material.dispose();arrow.geometry.dispose();tip.geometry.dispose();arrowMaterial.dispose();tipMaterial.dispose();glow.geometry.dispose();glow.material.dispose();for(const geometry of ownedGeometry)geometry.dispose();},update(hero:WarriorPose,dt=1/60){
    const active=bows.find(bow=>bow.visible)??ranger,armed=bows.some(bow=>bow.visible);string.visible=armed;arrow.visible=false;glow.visible=false;for(const extra of fanArrows)extra.visible=false;if(!armed)return;
    model.updateWorldMatrix(true,true);
    const attacking=!!hero.attack&&!hero.dead&&(!hero.attack.skillId||SKILLS[hero.attack.skillId].kind==='attack'),phase=hero.attack?hero.attack.age/hero.attack.duration:1,contact=hero.attack?.skillId?SKILLS[hero.attack.skillId].hitFraction:.49,draw=attacking&&phase<contact;
    drawWeight+=((attacking?1:0)-drawWeight)*(1-Math.exp(-Math.max(0,dt)*24));
    if(attacking){
      left.worldToLocal(right.localToWorld(rightLocal.set(0,7,2)));
      // Roll only around the grip's long axis. In attack the string's side of
      // the bow faces the actual drawing hand, never the back of the left arm.
      drawAngle=Math.atan2(-(BOW_GRIP.y-rightLocal.y),BOW_GRIP.z-rightLocal.z);
      drawAngle=T.MathUtils.clamp(drawAngle,-Math.PI*.85,Math.PI*.85);
    }
    for(const bow of bows){
      bow.rotation.set(drawAngle*drawWeight,0,0);
      offset.copy(sourceGrip).applyQuaternion(bow.quaternion);
      bow.position.set(BOW_GRIP.x-offset.x,BOW_GRIP.y-offset.y,BOW_GRIP.z-offset.z);
    }
    model.updateWorldMatrix(true,true);const length=typeof active.userData.bowLength==='number'?active.userData.bowLength:active===sentinel?62:55;
    model.worldToLocal(active.localToWorld(a.set(-length,0,-8)));model.worldToLocal(active.localToWorld(b.set(length,0,-8)));
    nock.copy(a).add(b).multiplyScalar(.5);
    if(draw){
      model.worldToLocal(right.localToWorld(nock.set(0,7,2)));model.worldToLocal(active.localToWorld(grip.copy(sourceGrip)));
      direction.copy(grip).sub(nock);const arrowLength=Math.max(.9,direction.length()+.18);direction.normalize();
      arrow.scale.y=arrowLength;arrow.position.copy(nock).addScaledVector(direction,arrowLength/2);arrow.quaternion.setFromUnitVectors(up,direction);arrow.visible=true;
      const skill:string=hero.attack?.skillId||'',frost=skill==='archer-frost-shot',poison=skill==='archer-poison',charge=T.MathUtils.clamp(phase/contact,0,1);
      arrowMaterial.emissive.set(poison?'#74d754':frost?'#5cbaf3':skill===''?'#000000':'#d7a746');arrowMaterial.emissiveIntensity=skill===''?0:.3+charge*.7;
      tipMaterial.emissive.copy(arrowMaterial.emissive);tipMaterial.emissiveIntensity=arrowMaterial.emissiveIntensity;
      tip.scale.setScalar(frost?1.8:1);
      if(skill==='archer-volley')fanArrows.forEach((extra,i)=>{const spread=(i===0?-1:1)*.16;offset.copy(direction).applyAxisAngle(up,spread);extra.scale.copy(arrow.scale);extra.position.copy(nock).addScaledVector(offset,arrowLength/2);extra.quaternion.setFromUnitVectors(up,offset);extra.visible=true;});
      if(skill==='archer-piercing'||skill==='archer-aimed'||poison||frost){glow.position.copy(nock).addScaledVector(direction,arrowLength-.05);glow.scale.setScalar(.4+charge*.9);glow.rotation.set(phase*9,phase*14,0);glow.material.color.set(poison?'#93e567':frost?'#97e5ff':'#ffe8a0');glow.material.opacity=.2+charge*.55;glow.visible=true;}
    }
    a.toArray(points,0);nock.toArray(points,3);b.toArray(points,6);geometry.attributes.position.needsUpdate=true;
  }};
}

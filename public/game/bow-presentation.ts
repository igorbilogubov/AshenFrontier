import * as T from './vendor/three.module.js';
import {SKILLS} from './skills.js';
import type {WarriorPose} from './render-types.js';
/** The string follows the actual animated drawing hand; no gameplay is simulated here. */
export function createBowPresentation(model:T.Object3D){
  const left=model.getObjectByName('mixamorigLeftHand')||model.getObjectByName('mixamorig:LeftHand'),right=model.getObjectByName('mixamorigRightHand')||model.getObjectByName('mixamorig:RightHand');
  const ranger=model.getObjectByName('ranger-bow'),sentinel=model.getObjectByName('sentinel-bow');
  if(!left||!right||!ranger)return {update(_hero:WarriorPose){},dispose(){}};
  model.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name==='Linen_Bowstring'){material.transparent=true;material.opacity=0;material.depthWrite=false;}});
  const points=new Float32Array(9),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(points,3));
  const string=new T.Line(geometry,new T.LineBasicMaterial({color:'#cbb78c'}));string.frustumCulled=false;model.add(string);
  const arrow=new T.Mesh(new T.CylinderGeometry(.006,.006,.9,5),new T.MeshStandardMaterial({color:'#a9956e',roughness:.75}));arrow.castShadow=false;model.add(arrow);
  const tip=new T.Mesh(new T.ConeGeometry(.024,.10,4),new T.MeshStandardMaterial({color:'#bcc2b3',metalness:.5,roughness:.4}));tip.position.y=.5;arrow.add(tip);
  const a=new T.Vector3(),b=new T.Vector3(),nock=new T.Vector3(),grip=new T.Vector3(),direction=new T.Vector3(),up=new T.Vector3(0,1,0);
  return {dispose(){geometry.dispose();string.material.dispose();arrow.geometry.dispose();tip.geometry.dispose();},update(hero:WarriorPose){
    const armed=!!(ranger.visible||sentinel?.visible);string.visible=armed;arrow.visible=false;if(!armed)return;
    model.updateWorldMatrix(true,true);const length=sentinel?.visible?62:55;
    model.worldToLocal(left.localToWorld(a.set(-length,0,-8)));model.worldToLocal(left.localToWorld(b.set(length,0,-8)));
    const phase=hero.attack?hero.attack.age/hero.attack.duration:1,contact=hero.attack?.skillId?SKILLS[hero.attack.skillId].hitFraction:.49,draw=!!hero.attack&&!hero.dead&&phase<contact;
    nock.copy(a).add(b).multiplyScalar(.5);
    if(draw){model.worldToLocal(right.localToWorld(nock.set(0,6,2)));model.worldToLocal(left.localToWorld(grip.set(0,0,12)));direction.copy(grip).sub(nock).normalize();arrow.position.copy(nock).addScaledVector(direction,.45);arrow.quaternion.setFromUnitVectors(up,direction);arrow.visible=true;}
    a.toArray(points,0);nock.toArray(points,3);b.toArray(points,6);geometry.attributes.position.needsUpdate=true;
  }};
}

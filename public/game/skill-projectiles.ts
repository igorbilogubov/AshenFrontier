import * as T from './vendor/three.module.js';
import type {PublicProjectile} from '../../shared/types.js';

/** A projectile's position and lifetime stay with the server; this group only
 * distinguishes silhouettes, trails and elemental motion around that position. */
export function createSkillProjectile(p:PublicProjectile){
  const group=new T.Group(),skill:string=p.skillId||'',arrow=p.kind==='archer',frost=skill==='archer-frost-shot'||skill==='mage-ice-lance',poison=skill==='archer-poison',aimed=skill==='archer-aimed',fire=skill==='mage-fireball',piercing=skill==='archer-piercing';
  const color=poison?'#90d662':aimed?'#fff3af':frost?'#a1e8ff':fire?'#ff8d36':arrow?piercing?'#ffecaa':'#d9c89f':'#b9a4ed';
  const shaft=new T.Mesh(arrow?new T.CylinderGeometry(.017,.017,piercing||aimed?1.05:.65,5):frost?new T.ConeGeometry(.095,.9,6):new T.IcosahedronGeometry(fire?.22:.13,1),new T.MeshBasicMaterial({color}));
  if(arrow){shaft.geometry.rotateX(Math.PI/2);const tip=new T.Mesh(new T.ConeGeometry(frost?.08:.05,.16,4),new T.MeshBasicMaterial({color:frost?'#d5fbff':'#e9e4ce'}));tip.rotation.x=Math.PI/2;tip.position.z=piercing?.59:.39;group.add(tip);
    const feather=new T.Mesh(new T.PlaneGeometry(.15,.18),new T.MeshBasicMaterial({color:poison?'#85c966':skill==='archer-volley'?'#9fcb88':'#a7a090',side:T.DoubleSide}));feather.rotation.x=Math.PI/2;feather.position.z=-.24;group.add(feather);
  }
  if(frost&&!arrow){shaft.rotation.x=Math.PI/2;shaft.position.z=.12;}group.add(shaft);
  if(p.skillId){
    const trail=new T.Mesh(new T.ConeGeometry(fire?.22:frost?.07:piercing?.055:.03,fire?1.5:piercing?2.2:1.1,6),new T.MeshBasicMaterial({color,transparent:true,opacity:.38,depthWrite:false,blending:T.AdditiveBlending}));trail.name='Skill_ProjectileTrail';trail.rotation.x=-Math.PI/2;trail.position.z=fire?-.8:piercing?-1.2:-.65;group.add(trail);
    if(fire){const shell=new T.Mesh(new T.IcosahedronGeometry(.3,1),new T.MeshBasicMaterial({color:'#ffca60',transparent:true,opacity:.4,depthWrite:false,blending:T.AdditiveBlending,wireframe:true}));shell.name='Skill_FireShell';group.add(shell);}
  }
  group.userData.dynamic=true;return group;
}
export function updateSkillProjectile(group:T.Group,p:PublicProjectile,time:number){
  const trail=group.getObjectByName('Skill_ProjectileTrail');if(trail)trail.scale.set(1+.10*Math.sin(time*33),1,1+.10*Math.sin(time*33));
  const shell=group.getObjectByName('Skill_FireShell');if(shell)shell.rotation.set(time*6,time*4,time*3);
}
export function disposeSkillProjectile(group:T.Group){group.removeFromParent();group.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});}

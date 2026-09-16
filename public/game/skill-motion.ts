import * as T from './vendor/three.module.js';
import type {WarriorPose} from './render-types.js';
import {SKILLS} from './skills.js';

const smooth=(value:number)=>{const x=T.MathUtils.clamp(value,0,1);return x*x*(3-2*x);};
/** Continuous accents layered on the licensed clips, in character-facing axes.
 * The envelope starts/ends at zero and never changes authoritative root position. */
export function skillMotionSample(skill:string,phase:number,contact:number){
  const p=T.MathUtils.clamp(phase,0,1),ready=smooth(p/Math.max(.12,contact*.55)),recover=1-smooth((p-contact)/Math.max(.001,1-contact));
  const envelope=ready*recover,charge=ready*(1-smooth((p-contact*.86)/Math.max(.001,contact*.24))),strike=Math.sin(Math.PI*smooth((p-contact*.8)/Math.max(.001,(1-contact)*.8)));
  let lean=0,turn=0,leftLift=0,rightLift=0,leftSpread=0,rightSpread=0,head=0,knee=0;
  switch(skill){
    case 'warrior-heavy':rightLift=-1.3*charge;leftLift=-.45*charge;lean=-.22*charge+.42*strike;turn=.18*strike;break;
    case 'warrior-bleed':turn=-.55*charge+.48*strike;rightSpread=.38*envelope;lean=.16*strike;break;
    case 'warrior-charge':lean=.48*envelope;leftLift=-.3*envelope;rightLift=-.4*envelope;knee=.3*envelope;break;
    case 'warrior-leap':rightLift=-.8*charge;leftLift=-.65*charge;knee=1.05*envelope;lean=-.12*charge+.32*strike;break;
    case 'warrior-guard':leftLift=-.65*envelope;rightLift=-.35*envelope;leftSpread=-.2*envelope;lean=.12*envelope;break;
    case 'warrior-berserk':leftSpread=.75*envelope;rightSpread=.65*envelope;lean=-.26*charge;head=-.18*envelope;break;
    case 'warrior-shout':leftSpread=.5*envelope;rightLift=-.8*envelope;lean=-.14*envelope;head=-.15*envelope;break;
    case 'warrior-banner':rightLift=.55*envelope;leftSpread=.25*envelope;lean=.6*envelope;knee=.8*envelope;break;
    case 'archer-aimed':turn=-.32*charge;rightSpread=.24*charge;lean=-.18*charge+.15*strike;head=.09*charge;break;
    case 'archer-poison':turn=-.18*charge;lean=.13*envelope;leftLift=.13*envelope;rightSpread=.2*charge;break;
    case 'archer-retreat':lean=-.32*envelope;knee=.7*envelope;leftSpread=.28*envelope;rightSpread=.22*envelope;break;
    case 'archer-roll':lean=.7*envelope;knee=1.4*envelope;leftSpread=-.45*envelope;rightSpread=-.4*envelope;break;
    case 'archer-trap':lean=.8*envelope;knee=1.1*envelope;rightLift=.6*envelope;leftSpread=.35*envelope;break;
    case 'archer-focus':lean=.13*envelope;head=.08*envelope;rightLift=-.45*envelope;leftLift=-.25*envelope;break;
    case 'archer-wind':leftSpread=.55*envelope;rightSpread=.5*envelope;turn=.2*envelope;break;
    case 'archer-smoke':rightLift=-.75*charge+.6*strike;turn=-.25*charge+.3*strike;lean=.25*strike;break;
    case 'mage-ice-lance':rightLift=-.5*charge;leftLift=-.28*envelope;turn=-.3*charge+.3*strike;lean=.2*strike;break;
    case 'mage-beam':rightLift=-.6*envelope;leftLift=-.25*envelope;leftSpread=.18*envelope;lean=.08*envelope;break;
    case 'mage-teleport':leftSpread=.65*envelope;rightSpread=.65*envelope;head=-.12*envelope;lean=-.14*envelope;break;
    case 'mage-ice-step':lean=.4*envelope;leftSpread=.38*envelope;rightLift=-.3*envelope;knee=.35*envelope;break;
    case 'mage-mana-shield':leftLift=-.7*envelope;rightLift=-.7*envelope;leftSpread=.35*envelope;rightSpread=.35*envelope;lean=-.1*envelope;break;
    case 'mage-seals':leftLift=-.3*charge+.5*strike;rightLift=-.3*charge+.5*strike;leftSpread=.55*envelope;rightSpread=.55*envelope;lean=.35*strike;break;
    case 'mage-ward':leftLift=-.8*envelope;rightLift=-.6*envelope;turn=.16*envelope;head=-.1*envelope;break;
    case 'mage-mana-source':leftLift=-1.05*charge;rightLift=-1.05*charge;lean=-.17*charge+.3*strike;knee=.4*strike;break;

    case 'warrior-cleave': turn=(-.34*charge+.25*strike);rightLift=-.16*charge;lean=.15*strike;break;
    case 'warrior-whirlwind':leftSpread=.28*envelope;rightSpread=.35*envelope;lean=.12*envelope;break;
    case 'warrior-thrust':turn=-.4*charge+.28*strike;rightLift=-.48*envelope;rightSpread=-.28*envelope;lean=.25*strike-.09*charge;break;
    case 'warrior-shockwave':rightLift=-1.12*charge;leftLift=-.48*charge;lean=-.16*charge+.42*strike;head=.12*strike;break;
    case 'archer-piercing':turn=-.24*charge;lean=-.12*charge+.16*strike;rightSpread=.19*charge;break;
    case 'archer-volley':turn=(-.38*charge+.33*strike);leftSpread=.2*envelope;rightSpread=.26*envelope;break;
    case 'archer-frost-shot':{const low=envelope*(1-smooth((p/contact-.45)/.55));lean=.22*low;leftLift=.22*low;rightLift=.18*low;head=-.12*low;break;}
    case 'archer-rain':lean=-.38*envelope;leftLift=-.5*envelope;rightLift=-.5*envelope;head=-.22*envelope;break;
    case 'mage-fireball':turn=-.23*charge+.28*strike;rightLift=-.22*charge;leftSpread=.25*charge;break;
    case 'mage-frost':leftSpread=.4*envelope;rightSpread=.4*envelope;lean=.16*strike;break;
    case 'mage-lightning':turn=-.35*charge+.22*strike;rightLift=-.58*envelope;leftLift=.25*envelope;leftSpread=-.2*envelope;lean=.16*strike;break;
    case 'mage-meteor':leftLift=-.68*charge;rightLift=-.82*charge;leftSpread=.18*charge;rightSpread=.18*charge;lean=-.2*charge+.36*strike;head=-.16*charge;break;
  }
  // The strike accent also tapers at the terminal pose (animation snapshots can
  // jump directly to 1, so do not rely on frame-by-frame damping for recovery).
  const end=1-smooth((p-.88)/.12);
  return {lean:lean*end,turn:turn*end,leftLift:leftLift*end,rightLift:rightLift*end,leftSpread:leftSpread*end,rightSpread:rightSpread*end,head:head*end,knee:knee*end,charge:charge*end};
}

export function createSkillMotion(model:T.Object3D){
  const find=(name:string)=>model.getObjectByName(`mixamorig${name}`)||model.getObjectByName(`mixamorig:${name}`);
  const bones={spine:find('Spine1'),chest:find('Spine2'),head:find('Neck'),left:find('LeftArm'),right:find('RightArm'),elbow:find('RightForeArm'),hand:find('RightHand'),leftThigh:find('LeftUpLeg'),rightThigh:find('RightUpLeg'),leftKnee:find('LeftLeg'),rightKnee:find('RightLeg')};
  const saved=new Map<T.Object3D,T.Quaternion>(),active=new Set<T.Object3D>(),axis=new T.Vector3(),world=new T.Quaternion(),parent=new T.Quaternion(),delta=new T.Quaternion(),local=new T.Quaternion();
  for(const bone of Object.values(bones))if(bone)saved.set(bone,new T.Quaternion());
  const shoulder=new T.Vector3(),elbow=new T.Vector3(),hand=new T.Vector3(),target=new T.Vector3(),along=new T.Vector3(),bend=new T.Vector3(),desiredElbow=new T.Vector3(),direction=new T.Vector3(),other=new T.Vector3();
  function remember(bone:T.Object3D){if(!active.has(bone)){saved.get(bone)!.copy(bone.quaternion);active.add(bone);}}
  function restore(){for(const bone of active)bone.quaternion.copy(saved.get(bone)!);active.clear();}
  function applyWorldDelta(bone:T.Object3D){remember(bone);bone.parent?.getWorldQuaternion(parent);local.copy(parent).invert().multiply(delta).multiply(parent);bone.quaternion.premultiply(local);bone.updateWorldMatrix(false,true);}
  function rotate(bone:T.Object3D|undefined,x:number,y:number,z:number){
    if(!bone)return;remember(bone);
    for(const [angle,ax,ay,az]of [[x,1,0,0],[y,0,1,0],[z,0,0,1]]){
      if(Math.abs(angle)<1e-8)continue;
      model.getWorldQuaternion(world);axis.set(ax,ay,az).applyQuaternion(world);
      bone.parent?.getWorldQuaternion(parent);delta.setFromAxisAngle(axis,angle);
      local.copy(parent).invert().multiply(delta).multiply(parent);bone.quaternion.premultiply(local);bone.updateWorldMatrix(false,false);
    }
  }
  return {restore,apply(hero:WarriorPose){
    if(!hero.attack||hero.dead||!hero.attack.skillId)return;
    const contact=SKILLS[hero.attack.skillId].hitFraction,m=skillMotionSample(hero.attack.skillId,hero.attack.skillId==='mage-beam'?contact:hero.attack.age/hero.attack.duration,contact);
    model.updateWorldMatrix(true,true);
    rotate(bones.spine,m.lean*.6,m.turn*.55,0);rotate(bones.chest,m.lean*.4,m.turn*.45,0);
    rotate(bones.leftThigh,-m.knee,0,0);rotate(bones.rightThigh,-m.knee*.75,0,0);rotate(bones.leftKnee,m.knee*1.6,0,0);rotate(bones.rightKnee,m.knee*1.4,0,0);
    rotate(bones.head,m.head,0,0);rotate(bones.left,m.leftLift,0,-m.leftSpread);rotate(bones.right,m.rightLift,0,m.rightSpread);
    if(hero.attack.skillId==='warrior-thrust'&&bones.right&&bones.elbow&&bones.hand){
      // A slash source supplies the feet and anticipation; a two-bone reach
      // makes the named thrust an actual forward extension at server contact.
      const p=hero.attack.age/hero.attack.duration,weight=smooth((p-.12)/(contact-.12))*(1-smooth((p-contact)/(1-contact)));
      if(weight>0){
        bones.right.getWorldPosition(shoulder);bones.elbow.getWorldPosition(elbow);bones.hand.getWorldPosition(hand);
        const upperLength=shoulder.distanceTo(elbow),lowerLength=elbow.distanceTo(hand);
        model.localToWorld(target.set(-.24,1.23,.95));target.lerpVectors(hand,target,weight);along.copy(target).sub(shoulder);
        const distance=T.MathUtils.clamp(along.length(),.01,(upperLength+lowerLength)*.99);along.normalize();target.copy(shoulder).addScaledVector(along,distance);
        const projected=(upperLength**2+distance**2-lowerLength**2)/(2*distance),height=Math.sqrt(Math.max(0,upperLength**2-projected**2));
        model.getWorldQuaternion(world);bend.set(-1,-.45,0).applyQuaternion(world);bend.addScaledVector(along,-bend.dot(along)).normalize();desiredElbow.copy(shoulder).addScaledVector(along,projected).addScaledVector(bend,height);
        direction.copy(elbow).sub(shoulder).normalize();other.copy(desiredElbow).sub(shoulder).normalize();delta.setFromUnitVectors(direction,other);applyWorldDelta(bones.right);
        bones.elbow.getWorldPosition(elbow);bones.hand.getWorldPosition(hand);direction.copy(hand).sub(elbow).normalize();other.copy(target).sub(elbow).normalize();delta.setFromUnitVectors(direction,other);applyWorldDelta(bones.elbow);
        // Authored sword length follows RightHand local X, through the grip.
        bones.hand.getWorldQuaternion(world);direction.set(1,0,0).applyQuaternion(world);model.getWorldQuaternion(world);other.set(0,0,1).applyQuaternion(world);delta.setFromUnitVectors(direction,other);delta.slerp(new T.Quaternion(),1-weight);applyWorldDelta(bones.hand);
      }
    }
  }};
}

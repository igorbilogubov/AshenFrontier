import * as T from './vendor/three.module.js';
import {clone} from './vendor/SkeletonUtils.js';
import {REGIONAL_COLLECTIONS,regionalAppearance} from './regional-equipment.js';
import type {ClassId,ItemAppearance} from '../../shared/types.js';

export const LATE_COLLECTION_REGIONS=['swamp','mines','rift','citadel'] as const;
export const LATE_GLOW_COLORS={swamp:{warrior:'#7ed8a4',archer:'#b4d67a',mage:'#7cd9c5'},mines:{warrior:'#7bd5f7',archer:'#e6ba78',mage:'#81aff3'},rift:{warrior:'#e79462',archer:'#f5d275',mage:'#be91f3'},citadel:{warrior:'#bfb0ff',archer:'#9ce8d6',mage:'#d5c8ff'}} as const;
export const lateEquipmentUrl=(classId:ClassId)=>new URL(`./characters/ashen-${classId}-late-equipment-v1.glb`,import.meta.url).href;
const cleanBoneName=(name:string)=>name.replace(':','');
/** Attach only our authored slot meshes. All animation uses the existing actor's bones. */
export function attachLateEquipment(model:T.Object3D,source:T.Object3D){
  const bones=new Map<string,T.Bone>();model.traverse(o=>{if(o instanceof T.Bone)bones.set(cleanBoneName(o.name),o);});
  const extra=clone(source);extra.name='LateEquipment';const palettes=new Map<T.Skeleton,T.Skeleton>();
  extra.traverse(o=>{if(o instanceof T.SkinnedMesh){
    let palette=palettes.get(o.skeleton);if(!palette){
      const mapped=o.skeleton.bones.map(bone=>{const target=bones.get(cleanBoneName(bone.name));if(!target)throw new Error(`Late equipment bone missing: ${bone.name}`);return target;});
      palette=new T.Skeleton(mapped,o.skeleton.boneInverses.map(matrix=>matrix.clone()));palettes.set(o.skeleton,palette);
    }
    o.skeleton=palette;o.frustumCulled=false;
  }});
  const roots:T.Bone[]=[];extra.traverse(o=>{if(o instanceof T.Bone&&!(o.parent instanceof T.Bone))roots.push(o);});for(const root of roots)root.removeFromParent();
  model.add(extra);return extra;
}
/** Per-instance visibility and emissive materials; never mutates cached GLB materials. */
export function createLateEquipmentVisuals(model:T.Object3D,classId:ClassId){
  const parts=new Map<string,T.Object3D>();
  for(const region of LATE_COLLECTION_REGIONS){const prefix=REGIONAL_COLLECTIONS[region][classId][0];for(const slot of ['weapon','armor','helmet','boots','ring','amulet']){const name=`${prefix}-${slot}`,part=model.getObjectByName(name);if(part){parts.set(name,part);part.visible=false;}}}
  let enhancement=0;
  function applyEnhancement(value:number){
    enhancement=Number.isFinite(value)?T.MathUtils.clamp(Math.floor(value),0,9):0;
    const intensity=enhancement===0?.08:enhancement<=3?.12+enhancement*.07:enhancement<=6?.4+(enhancement-3)*.17:.95+(enhancement-6)*.32;
    for(const [appearance,part] of parts){const variant=regionalAppearance(appearance);if(!variant||!LATE_COLLECTION_REGIONS.includes(variant.region as typeof LATE_COLLECTION_REGIONS[number]))continue;
      const color=LATE_GLOW_COLORS[variant.region as keyof typeof LATE_GLOW_COLORS][classId];
      part.traverse(o=>{if(!(o instanceof T.Mesh))return;for(const material of Array.isArray(o.material)?o.material:[o.material])if(material instanceof T.MeshStandardMaterial){
        if(material.name.endsWith('_Glow')){material.emissive.set(color);material.emissiveIntensity=intensity;}
        else if(appearance.endsWith('-weapon')&&material.name.endsWith('_Metal')){material.emissive.set(color);material.emissiveIntensity=enhancement<4?0:(enhancement-3)*.035;}
      }});
    }
    return enhancement;
  }
  function apply(appearance:ItemAppearance|undefined):ItemAppearance|undefined{
    for(const part of parts.values())part.visible=false;if(!appearance)return appearance;const mapped={...appearance};
    for(const [slot,value] of Object.entries(appearance)){const part=value?parts.get(value):undefined;if(part){part.visible=true;mapped[slot as keyof ItemAppearance]=null;}}
    applyEnhancement(enhancement);return mapped;
  }
  return {apply,applyEnhancement,get parts(){return parts;}};
}

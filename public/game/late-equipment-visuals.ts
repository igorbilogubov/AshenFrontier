import * as T from './vendor/three.module.js';
import {clone} from './vendor/SkeletonUtils.js';
import {CLASS_ITEMS} from './equipment-items.js';
import {REGIONAL_COLLECTIONS,regionalAppearance} from './regional-equipment.js';
import type {ClassId,EquipmentSlot,ItemAppearance} from '../../shared/types.js';
import type {GearRegion} from './regional-equipment.js';

export const LATE_COLLECTION_REGIONS=['swamp','mines','rift','citadel'] as const;
export const EARLY_GLOW_COLORS={forest:{warrior:'#e6c56d',archer:'#a4d47c',mage:'#9b8ee8'},snow:{warrior:'#9ad7ee',archer:'#c8eef8',mage:'#b7c8f5'},wasteland:{warrior:'#e2a070',archer:'#e8c07a',mage:'#e09ab8'}} as const;
export const LATE_GLOW_COLORS={swamp:{warrior:'#7ed8a4',archer:'#b4d67a',mage:'#7cd9c5'},mines:{warrior:'#7bd5f7',archer:'#e6ba78',mage:'#81aff3'},rift:{warrior:'#e79462',archer:'#f5d275',mage:'#be91f3'},citadel:{warrior:'#bfb0ff',archer:'#9ce8d6',mage:'#d5c8ff'}} as const;
export const GLOW_COLORS={...EARLY_GLOW_COLORS,...LATE_GLOW_COLORS} as const;
export const lateEquipmentUrl=(classId:ClassId)=>new URL(`./characters/ashen-${classId}-late-equipment-v1.glb`,import.meta.url).href;
const cleanBoneName=(name:string)=>name.replace(':','');
const SLOTS=['weapon','armor','helmet','boots','ring','amulet'] as const satisfies readonly EquipmentSlot[];
const WARRIOR_FOREST_MESHES:Record<string,readonly string[]>={
  'wanderer-sword':['Weapon_Sword'],'watch-sword':['Weapon_WatchSword'],
  'wanderer-armor':['Traveller_Armor','Traveller_Cape','Traveller_Limbs'],'watch-armor':['Armor_Body','Cape'],
  'wanderer-hood':['Traveller_Hood','Traveller_Coif'],'watch-helm':['Helmet'],
  'wanderer-boots':['Traveller_Boots'],'watch-boots':['Boots'],
  'copper-ring':['Copper_Ring'],'ember-amulet':['Ember_Amulet']
};
type GlowInfo={region:GearRegion;classId:ClassId;slot:EquipmentSlot};
function glowInfo(appearance:string):GlowInfo|undefined{
  const regional=regionalAppearance(appearance);
  if(regional)return {region:regional.region,classId:regional.classId,slot:regional.slot};
  for(const classId of ['warrior','archer','mage'] as const){
    const item=CLASS_ITEMS[classId].find(entry=>entry.appearance===appearance);
    if(item)return {region:'forest',classId,slot:item.slot};
  }
}
type ClothOriginal={color:T.Color;emissive:T.Color;emissiveIntensity:number;roughness:number};
export function enhancementGlow(level:number,slot?:EquipmentSlot){
  const enhancement=T.MathUtils.clamp(Math.floor(Number.isFinite(level)?level:0),0,9);
  if(!enhancement)return {enhancement:0,paint:0,emissive:0,sheen:0};
  const weapon=slot==='weapon';
  return {
    enhancement,
    paint:weapon?.04+enhancement*.028:.02+enhancement*.016,
    emissive:weapon?.025+enhancement*.02:.01+enhancement*.01,
    sheen:.008+enhancement*.006
  };
}
export type SlotEnhance=Partial<Record<EquipmentSlot,number>>;

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
function sourceMeshes(root:T.Object3D,skip:Set<T.Object3D>){
  const list:T.Mesh[]=[];
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;
    if(object!==root&&skip.has(object))return;
    list.push(object);
  });
  return list;
}
function clothOf(mesh:T.Mesh){
  return (Array.isArray(mesh.material)?mesh.material:[mesh.material]).filter((material):material is T.MeshStandardMaterial=>material instanceof T.MeshStandardMaterial);
}
/** Per-instance visibility; paints each worn slot brighter with enhancement, like MU Online. */
export function createLateEquipmentVisuals(model:T.Object3D,classId:ClassId){
  const parts=new Map<string,T.Object3D>();
  for(const region of LATE_COLLECTION_REGIONS){const prefix=REGIONAL_COLLECTIONS[region][classId][0];for(const slot of SLOTS){const name=`${prefix}-${slot}`,part=model.getObjectByName(name);if(part){parts.set(name,part);part.visible=false;}}}
  const earlyRoots:T.Object3D[]=[];
  if(classId==='warrior')for(const names of Object.values(WARRIOR_FOREST_MESHES))for(const name of names){const part=model.getObjectByName(name);if(part)earlyRoots.push(part);}
  else for(const item of CLASS_ITEMS[classId]){const part=model.getObjectByName(item.appearance);if(part)earlyRoots.push(part);}
  const skip=new Set<T.Object3D>([...earlyRoots,...parts.values()]);
  const originals=new WeakMap<T.MeshStandardMaterial,ClothOriginal>();
  const slotCloth=new Map<EquipmentSlot,T.MeshStandardMaterial[]>();
  function remember(slot:EquipmentSlot,material:T.MeshStandardMaterial){
    if(!originals.has(material))originals.set(material,{color:material.color.clone(),emissive:material.emissive.clone(),emissiveIntensity:material.emissiveIntensity,roughness:material.roughness});
    const list=slotCloth.get(slot)??[];
    if(!list.includes(material))list.push(material);
    slotCloth.set(slot,list);
  }
  function addCloth(root:T.Object3D,slot:EquipmentSlot){
    for(const mesh of sourceMeshes(root,skip))for(const material of clothOf(mesh))remember(slot,material);
  }
  for(const [appearance,part] of parts){const info=glowInfo(appearance);if(info)addCloth(part,info.slot);}
  for(const root of earlyRoots){
    const info=glowInfo(root.name)||[...Object.entries(WARRIOR_FOREST_MESHES)].flatMap(([appearance,names])=>names.includes(root.name)?[glowInfo(appearance)]:[]).find(Boolean);
    if(info)addCloth(root,info.slot);
  }
  let enhancement=0,current:ItemAppearance|undefined,lastLevels:number|SlotEnhance=0;
  function glowColor(appearance:string){
    const info=glowInfo(appearance);if(!info)return;
    return GLOW_COLORS[info.region][classId];
  }
  function slotLevel(slot:EquipmentSlot,value:number|SlotEnhance){
    if(typeof value==='number')return value;
    return value[slot]??0;
  }
  function applyEnhancement(value:number|SlotEnhance=lastLevels){
    const source=value;
    enhancement=typeof value==='number'?enhancementGlow(value).enhancement:Math.max(0,...SLOTS.map(slot=>enhancementGlow(slotLevel(slot,value),slot).enhancement));
    const tint=new T.Color(),overlay=new T.Color();
    for(const slot of SLOTS){
      const worn=current?.[slot]??null;
      const glow=enhancementGlow(slotLevel(slot,source),slot);
      const paint=worn?glowColor(worn)??GLOW_COLORS.forest[classId]:GLOW_COLORS.forest[classId];
      tint.set(paint);
      for(const material of slotCloth.get(slot)??[]){
        const original=originals.get(material);if(!original)continue;
        overlay.copy(original.color).multiply(tint);
        material.color.copy(original.color).lerp(overlay,glow.paint);
        material.emissive.copy(original.emissive);
        material.emissiveIntensity=original.emissiveIntensity+glow.emissive;
        if(glow.emissive)material.emissive.lerp(tint,Math.min(.85,glow.paint+.35));
        material.roughness=Math.max(.28,original.roughness-glow.sheen);
      }
    }
    lastLevels=typeof source==='number'?source:{...source};
    return enhancement;
  }
  function apply(appearance:ItemAppearance|undefined):ItemAppearance|undefined{
    current=appearance;
    for(const part of parts.values())part.visible=false;
    if(!appearance){applyEnhancement(lastLevels);return appearance;}
    const mapped={...appearance};
    for(const [slot,value] of Object.entries(appearance)){const part=value?parts.get(value):undefined;if(part){part.visible=true;mapped[slot as keyof ItemAppearance]=null;}}
    applyEnhancement(lastLevels);return mapped;
  }
  function dispose(){
    for(const list of slotCloth.values())for(const material of list){
      const original=originals.get(material);if(!original)continue;
      material.color.copy(original.color);material.emissive.copy(original.emissive);
      material.emissiveIntensity=original.emissiveIntensity;material.roughness=original.roughness;
    }
    slotCloth.clear();
  }
  return {apply,applyEnhancement,dispose,get parts(){return parts;}};
}

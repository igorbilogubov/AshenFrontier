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
function isLate(region:GearRegion){return (LATE_COLLECTION_REGIONS as readonly string[]).includes(region);}
function hasGlowMaterial(root:T.Object3D){
  let found=false;
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name.endsWith('_Glow'))found=true;
  });
  return found;
}
function hasMetalMaterial(root:T.Object3D){
  let found=false;
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name.endsWith('_Metal'))found=true;
  });
  return found;
}
function ownMaterials(root:T.Object3D){
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;
    const list=Array.isArray(object.material)?object.material:[object.material];
    const next=list.map(material=>{
      if(!(material instanceof T.MeshStandardMaterial)||material.userData.earlyGlowOwned)return material;
      const owned=material.clone();owned.userData.earlyGlowOwned=true;return owned;
    });
    object.material=Array.isArray(object.material)?next:next[0];
  });
}
function tagEarlyMaterials(root:T.Object3D){
  ownMaterials(root);
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!(material instanceof T.MeshStandardMaterial)||material.name.endsWith('_Glow')||material.name.endsWith('_Metal'))continue;
      const gem=/Gem|Stone|Ember/i.test(material.name);
      const jewelry=/ring|amulet/i.test(root.name);
      if(gem||jewelry)material.name=material.name.replace(/(_Glow)?$/,'')+'_Glow';
      else if(material.metalness>=.25)material.name=material.name.replace(/(_Metal)?$/,'')+'_Metal';
    }
  });
}
export function enhancementGlow(level:number){
  const enhancement=T.MathUtils.clamp(Math.floor(Number.isFinite(level)?level:0),0,9);
  const intensity=enhancement===0?.08:enhancement<=3?.2+enhancement*.16:enhancement<=6?.68+(enhancement-3)*.12:.98+(enhancement-6)*.18;
  const metal=enhancement===0?0:enhancement<=3?.03*enhancement:Math.min(.12,.09+(enhancement-3)*.01);
  return {enhancement,intensity,metal};
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
/** Per-instance visibility and emissive materials; never mutates cached GLB materials. */
export function createLateEquipmentVisuals(model:T.Object3D,classId:ClassId){
  const parts=new Map<string,T.Object3D>();
  for(const region of LATE_COLLECTION_REGIONS){const prefix=REGIONAL_COLLECTIONS[region][classId][0];for(const slot of SLOTS){const name=`${prefix}-${slot}`,part=model.getObjectByName(name);if(part){parts.set(name,part);part.visible=false;}}}
  const earlyRoots:T.Object3D[]=[];
  if(classId==='warrior')for(const names of Object.values(WARRIOR_FOREST_MESHES))for(const name of names){const part=model.getObjectByName(name);if(part)earlyRoots.push(part);}
  else for(const item of CLASS_ITEMS[classId]){const part=model.getObjectByName(item.appearance);if(part)earlyRoots.push(part);}
  for(const root of earlyRoots)tagEarlyMaterials(root);
  for(const part of parts.values())ownMaterials(part);
  const bones=new Map<string,T.Bone>();model.traverse(object=>{if(object instanceof T.Bone)bones.set(cleanBoneName(object.name),object);});
  const inlays=new Map<EquipmentSlot,T.Mesh[]>();
  function addInlay(slot:EquipmentSlot,boneName:string,local:readonly [number,number,number]){
    const bone=bones.get('mixamorig'+boneName)??bones.get(boneName);if(!bone)return;
    const material=new T.MeshStandardMaterial({name:'early_Glow',color:'#111111',emissive:'#ffffff',emissiveIntensity:.08,metalness:.3,roughness:.26});
    const mesh=new T.Mesh(new T.OctahedronGeometry(3.1),material);mesh.name=`EarlyGlow_${slot}_${boneName}`;
    mesh.position.set(local[0],local[1],local[2]);mesh.castShadow=false;mesh.receiveShadow=false;mesh.visible=false;bone.add(mesh);
    const list=inlays.get(slot)??[];list.push(mesh);inlays.set(slot,list);
  }
  addInlay('armor','Spine2',[0,2,14]);
  addInlay('helmet','Head',[0,8,8]);
  addInlay('boots','LeftLeg',[2,10,6]);addInlay('boots','RightLeg',[-2,10,6]);
  if(classId==='archer')addInlay('weapon','LeftHand',[0,16,0]);
  else addInlay('weapon','RightHand',[35,7,2]);
  let enhancement=0,current:ItemAppearance|undefined,lastLevels:number|SlotEnhance=0;
  function glowColor(appearance:string){
    const info=glowInfo(appearance);if(!info)return;
    return GLOW_COLORS[info.region][classId];
  }
  function earlyParts(slot:EquipmentSlot,appearance:string){
    const info=glowInfo(appearance);if(!info||isLate(info.region))return [];
    if(classId==='warrior'){
      if(slot==='ring')return [model.getObjectByName('Copper_Ring')].filter((part):part is T.Object3D=>!!part);
      if(slot==='amulet')return [model.getObjectByName('Ember_Amulet')].filter((part):part is T.Object3D=>!!part);
    }
    const base=info.region==='forest'?appearance:regionalAppearance(appearance)?.base;
    const names=classId==='warrior'?(base?WARRIOR_FOREST_MESHES[base]??[]:[]):(base?[base]:[]);
    return names.map(name=>model.getObjectByName(name)).filter((part):part is T.Object3D=>!!part);
  }
  function paint(part:T.Object3D,color:string,intensity:number,metal:number){
    part.traverse(object=>{
      if(!(object instanceof T.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof T.MeshStandardMaterial){
        if(material.name.endsWith('_Glow')){material.emissive.set(color);material.emissiveIntensity=intensity;}
        else if(material.name.endsWith('_Metal')){material.emissive.set(color);material.emissiveIntensity=metal;}
      }
    });
  }
  function slotLevel(slot:EquipmentSlot,value:number|SlotEnhance){
    if(typeof value==='number')return value;
    return value[slot]??0;
  }
  function applyEnhancement(value:number|SlotEnhance=lastLevels){
    const source=value;
    enhancement=typeof value==='number'?enhancementGlow(value).enhancement:Math.max(0,...SLOTS.map(slot=>enhancementGlow(slotLevel(slot,value)).enhancement));
    for(const root of earlyRoots)paint(root,'#000000',0,0);
    for(const [appearance,part] of parts){const variant=regionalAppearance(appearance);if(!variant||!isLate(variant.region))continue;
      const glow=enhancementGlow(slotLevel(variant.slot,source));
      paint(part,LATE_GLOW_COLORS[variant.region as keyof typeof LATE_GLOW_COLORS][classId],glow.intensity,glow.metal);
    }
    for(const slot of SLOTS){
      const worn=current?.[slot]??null;
      const info=worn?glowInfo(worn):undefined;
      const early=!!info&&!isLate(info.region);
      const glow=enhancementGlow(slotLevel(slot,source));
      const color=worn&&early?glowColor(worn)??GLOW_COLORS.forest[classId]:GLOW_COLORS.forest[classId];
      if(early&&worn)for(const part of earlyParts(slot,worn))paint(part,color,glow.intensity,glow.metal);
      const meshes=early&&worn?earlyParts(slot,worn):[];
      const authored=meshes.some(hasGlowMaterial)||(slot==='weapon'&&classId==='warrior'&&meshes.some(hasMetalMaterial));
      for(const mesh of inlays.get(slot)??[]){
        mesh.visible=early&&!authored;
        const gem=mesh.material as T.MeshStandardMaterial;gem.emissive.set(color);gem.emissiveIntensity=glow.intensity;
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
  return {apply,applyEnhancement,get parts(){return parts;}};
}

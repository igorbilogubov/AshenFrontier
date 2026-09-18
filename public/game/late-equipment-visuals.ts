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
const TINT_VERTEX=`varying vec3 vViewDir;varying vec3 vNormalView;
#include <common>
#include <batching_pars_vertex>
#include <skinning_pars_vertex>
void main(){
  #include <batching_vertex>
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vNormalView=normalize(transformedNormal);
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewDir=normalize(-mvPosition.xyz);
}`;
const TINT_FRAGMENT=`uniform vec3 uColor;uniform float uIntensity;
varying vec3 vViewDir;varying vec3 vNormalView;
void main(){
  float facing=max(dot(normalize(vNormalView),normalize(vViewDir)),0.0);
  gl_FragColor=vec4(uColor*uIntensity*(0.18+0.82*facing),1.0);
}`;
function createTintMaterial(){
  return new T.ShaderMaterial({
    name:'EnhanceTint',
    uniforms:{uColor:{value:new T.Color('#e6c56d')},uIntensity:{value:0}},
    vertexShader:TINT_VERTEX,
    fragmentShader:TINT_FRAGMENT,
    transparent:true,
    blending:T.AdditiveBlending,
    depthWrite:false,
    depthTest:true,
    toneMapped:false,
    fog:false,
    lights:false,
    side:T.FrontSide
  });
}
export function enhancementGlow(level:number,slot?:EquipmentSlot){
  const enhancement=T.MathUtils.clamp(Math.floor(Number.isFinite(level)?level:0),0,9);
  if(!enhancement)return {enhancement:0,intensity:0};
  const weapon=slot==='weapon';
  return {enhancement,intensity:weapon?.1+enhancement*.04:.05+enhancement*.022};
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
    if(!(object instanceof T.Mesh)||object.name.startsWith('EnhanceTint'))return;
    if(object!==root&&skip.has(object))return;
    list.push(object);
  });
  return list;
}
function attachTint(source:T.Mesh,material:T.ShaderMaterial,slot:EquipmentSlot){
  const tint=source instanceof T.SkinnedMesh?new T.SkinnedMesh(source.geometry,material):new T.Mesh(source.geometry,material);
  tint.name=`EnhanceTint_${slot}`;
  tint.frustumCulled=false;tint.castShadow=false;tint.receiveShadow=false;tint.renderOrder=2;tint.visible=false;
  if(tint instanceof T.SkinnedMesh&&source instanceof T.SkinnedMesh)tint.bind(source.skeleton,source.bindMatrix);
  source.add(tint);
  return tint;
}
/** Per-instance visibility; additive tint sits on the mesh without touching cloth albedo. */
export function createLateEquipmentVisuals(model:T.Object3D,classId:ClassId){
  const parts=new Map<string,T.Object3D>();
  for(const region of LATE_COLLECTION_REGIONS){const prefix=REGIONAL_COLLECTIONS[region][classId][0];for(const slot of SLOTS){const name=`${prefix}-${slot}`,part=model.getObjectByName(name);if(part){parts.set(name,part);part.visible=false;}}}
  const earlyRoots:T.Object3D[]=[];
  if(classId==='warrior')for(const names of Object.values(WARRIOR_FOREST_MESHES))for(const name of names){const part=model.getObjectByName(name);if(part)earlyRoots.push(part);}
  else for(const item of CLASS_ITEMS[classId]){const part=model.getObjectByName(item.appearance);if(part)earlyRoots.push(part);}
  const skip=new Set<T.Object3D>([...earlyRoots,...parts.values()]);
  const tintMaterials=new Map<EquipmentSlot,T.ShaderMaterial>();
  const tints:T.Mesh[]=[];
  function tintMaterial(slot:EquipmentSlot){
    let material=tintMaterials.get(slot);if(material)return material;
    material=createTintMaterial();tintMaterials.set(slot,material);return material;
  }
  function addTints(root:T.Object3D,slot:EquipmentSlot){
    const material=tintMaterial(slot);
    for(const mesh of sourceMeshes(root,skip))tints.push(attachTint(mesh,material,slot));
  }
  for(const [appearance,part] of parts){const info=glowInfo(appearance);if(info)addTints(part,info.slot);}
  for(const root of earlyRoots){
    const info=glowInfo(root.name)||[...Object.entries(WARRIOR_FOREST_MESHES)].flatMap(([appearance,names])=>names.includes(root.name)?[glowInfo(appearance)]:[]).find(Boolean);
    if(info)addTints(root,info.slot);
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
    for(const slot of SLOTS){
      const worn=current?.[slot]??null;
      const glow=enhancementGlow(slotLevel(slot,source),slot);
      const color=worn?glowColor(worn)??GLOW_COLORS.forest[classId]:GLOW_COLORS.forest[classId];
      const material=tintMaterials.get(slot);
      if(material){
        material.uniforms.uColor.value.set(color);
        material.uniforms.uIntensity.value=glow.intensity;
      }
      for(const tint of tints)if(tint.name===`EnhanceTint_${slot}`)tint.visible=glow.enhancement>0;
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
    for(const tint of tints)tint.removeFromParent();
    for(const material of tintMaterials.values())material.dispose();
    tints.length=0;tintMaterials.clear();
  }
  return {apply,applyEnhancement,dispose,get parts(){return parts;}};
}

import * as T from './vendor/three.module.js';
import {regionalAppearance} from './regional-equipment.js';
import type {ClassId,ItemAppearance} from '../../shared/types.js';

// Reuse the approved textured silhouettes and skinning. Colours match the
// Blender inventory renders; each character already owns cloned materials.
export const REGION_PALETTES={snow:{warrior:'#acd3df',archer:'#8aa9ac',mage:'#a6b7de'},wasteland:{warrior:'#ce9878',archer:'#ab8762',mage:'#c395ab'},swamp:{warrior:'#75947a',archer:'#b2a572',mage:'#8fc5b4'},mines:{warrior:'#a3bcc8',archer:'#b38f62',mage:'#85bce6'},rift:{warrior:'#ba7159',archer:'#d6aa62',mage:'#a898dd'},citadel:{warrior:'#a5a7c7',archer:'#9677b9',mage:'#b4cbdf'}} as const;
const warriorParts:Record<string,string[]>={'watch-sword':['Weapon_WatchSword'],'watch-armor':['Armor_Body','Cape'],'watch-helm':['Helmet'],'watch-boots':['Boots'],'copper-ring':['Copper_Ring'],'ember-amulet':['Ember_Amulet']};
export function createRegionalEquipmentVisuals(model:T.Object3D){
  const originals=new Map<T.MeshStandardMaterial,{color:T.Color;metalness:number;roughness:number}>();
  model.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof T.MeshStandardMaterial)originals.set(material,{color:material.color.clone(),metalness:material.metalness,roughness:material.roughness});});
  return (appearance:ItemAppearance|undefined,classId:ClassId):ItemAppearance|undefined=>{
    for(const [material,original] of originals){material.color.copy(original.color);material.metalness=original.metalness;material.roughness=original.roughness;}
    if(!appearance)return appearance;
    const mapped={...appearance};
    for(const [slot,value] of Object.entries(appearance)){
      const variant=regionalAppearance(value);if(!variant||variant.classId!==classId)continue;
      mapped[slot as keyof ItemAppearance]=variant.base;
      const names=classId==='warrior'?warriorParts[variant.base]??[]:[variant.base];
      for(const name of names)model.getObjectByName(name)?.traverse(object=>{
        if(!(object instanceof T.Mesh))return;
        for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof T.MeshStandardMaterial){
          material.color.copy(originals.get(material)?.color??new T.Color('white')).multiply(new T.Color(REGION_PALETTES[variant.region][classId]));
          if(variant.slot==='weapon'||variant.slot==='ring'||variant.slot==='amulet'){material.metalness=Math.max(material.metalness,.35);material.roughness=.48;}
        }
      });
    }
    return mapped;
  };
}

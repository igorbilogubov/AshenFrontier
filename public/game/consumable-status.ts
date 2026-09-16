import {assignedConsumable,consumableQuantity} from './consumables.js';
import type {SelfSnapshot,QuickSlot} from '../../shared/types.js';

type PotionHero=Pick<SelfSnapshot,'quickSlots'|'consumableInventory'|'hp'|'maxHp'|'mana'|'maxMana'|'dead'|'potionCooldown'|'manaPotionCooldown'>;
/** Both quick slots use the cooldown of their assigned resource, whatever the size. */
export function consumableStatus(hero:PotionHero,slot:QuickSlot,connected:boolean){
  const definition=assignedConsumable(hero,slot),count=definition?consumableQuantity(hero,definition.id):0;
  const remaining=definition?Math.max(0,definition.kind==='hp'?hero.potionCooldown:hero.manaPotionCooldown):0;
  const full=definition?.kind==='hp'?hero.hp>=hero.maxHp:hero.mana>=hero.maxMana;
  const available=connected&&!hero.dead&&!!definition&&count>0&&remaining===0&&!full;
  const seconds=Math.ceil(remaining),fraction=definition?Math.min(1,remaining/definition.cooldown):0;
  const label=!connected?'Нет связи':hero.dead?'Недоступно':!definition?'Назначьте зелье':remaining>0?`${seconds} с`:!count?'Нет зелий':full?'Полный запас':'Готово';
  return {definition,count,available,seconds,fraction,label};
}

/** One pulse when an unavailable assigned potion becomes usable, never on every HUD tick. */
export function bindConsumableStatus(button:HTMLButtonElement){
  let previous:{id:string|undefined;available:boolean}|undefined;
  const timer=button.querySelector<HTMLElement>('.potion-timer')!;
  return (status:ReturnType<typeof consumableStatus>)=>{
    button.classList.toggle('quick-unavailable',!status.available);
    button.classList.toggle('quick-ready',status.available);
    button.classList.toggle('quick-cooling',status.seconds>0);
    button.setAttribute('aria-disabled',String(!status.available));
    button.style.setProperty('--potion-cooldown',`${status.fraction*100}%`);
    timer.hidden=status.seconds===0;timer.textContent=status.seconds?`${status.seconds} с`:'';
    if(previous?.id===status.definition?.id&&!previous?.available&&status.available){
      button.classList.remove('quick-refreshed');
      // Removing the class while unavailable lets the next availability transition restart it.
      button.classList.add('quick-refreshed');
    }
    if(!status.available)button.classList.remove('quick-refreshed');
    previous={id:status.definition?.id,available:status.available};
  };
}

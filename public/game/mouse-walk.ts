import type {Point} from '../../shared/types.js';

const HOLD_DELAY_MS=180;
const idle=()=>({x:0,z:0,aim:null as number|null});

/** A short ground press leaves its server route intact; a hold takes over steering. */
export class MouseWalk {
  private pressedAt:number|null=null;
  private steering=false;
  get pressed(){return this.pressedAt!==null;}
  press(now:number){this.pressedAt=now;this.steering=false;}
  release(){const stop=this.steering;this.pressedAt=null;this.steering=false;return stop;}
  sample(hero:Point&{dead:number},point:Point|null,now:number){
    const takeover=this.pressedAt!==null&&!this.steering&&now-this.pressedAt>=HOLD_DELAY_MS;
    if(takeover)this.steering=true;
    const input=idle();
    if(this.steering&&!hero.dead&&point&&Number.isFinite(point.x)&&Number.isFinite(point.z)){
      const dx=point.x-hero.x,dz=point.z-hero.z,distance=Math.hypot(dx,dz);
      if(distance>.18){const strength=Math.min(1,(distance-.18)/.7);input.x=dx/distance*strength;input.z=dz/distance*strength;input.aim=Math.atan2(dx,dz);}
    }
    return {takeover,input};
  }
}

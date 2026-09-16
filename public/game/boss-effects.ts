import * as T from './vendor/three.module.js';
import type {PublicMob} from '../../shared/types.js';
/** Server telegraphs; the filled shape is the exact damage area in dungeons.ts. */
export function createBossEffects(scene:T.Scene){
 const warnings=new Map<number,{mesh:T.Mesh<T.RingGeometry,T.MeshBasicMaterial>;key:string}>();
 return {sync(mobs:readonly PublicMob[]){
  const active=new Set<number>();
  for(const mob of mobs){const t=mob.telegraph;if(!t||mob.state==='dead')continue;active.add(mob.id);const key=`${t.kind}:${t.yaw}:${t.radius}:${t.x}:${t.z}`;let v=warnings.get(mob.id);
   if(v?.key!==key){if(v){v.mesh.removeFromParent();v.mesh.geometry.dispose();v.mesh.material.dispose();}const start=t.kind==='cone'?Math.PI/2-t.yaw-t.halfAngle:0,length=t.kind==='cone'?t.halfAngle*2:Math.PI*2;
    const mesh=new T.Mesh(new T.RingGeometry(t.kind==='ring'?t.innerRadius:.001,t.radius,80,1,start,length),new T.MeshBasicMaterial({color:t.kind==='circle'?'#ff6752':t.kind==='ring'?'#d88cff':'#ffa240',transparent:true,opacity:.4,side:T.DoubleSide,depthWrite:false}));mesh.rotation.x=Math.PI/2;mesh.position.set(t.x,.075,t.z);mesh.renderOrder=3;scene.add(mesh);v={mesh,key};warnings.set(mob.id,v);
   }
   v!.mesh.material.opacity=.17+.36*(1-t.remaining/t.duration);
  }
  for(const [id,v]of warnings)if(!active.has(id)){v.mesh.removeFromParent();v.mesh.geometry.dispose();v.mesh.material.dispose();warnings.delete(id);}
 },clear(){for(const v of warnings.values()){v.mesh.removeFromParent();v.mesh.geometry.dispose();v.mesh.material.dispose();}warnings.clear();}};
}

import * as T from './vendor/three.module.js';
import {surfaceMaterial} from './forms.js';

const mat=(color,metalness=0,roughness=.8)=>new T.MeshStandardMaterial({color,metalness,roughness});
export const materials={steel:surfaceMaterial('#819397',{metalness:.66,roughness:.48,grain:.055}),edge:mat('#c4cdc6',.78,.32),dark:surfaceMaterial('#26323a',{metalness:.35,roughness:.72}),leather:surfaceMaterial('#342923',{grain:.12}),gold:surfaceMaterial('#ae8450',{metalness:.64,roughness:.49,grain:.06}),cloth:surfaceMaterial('#722d32',{grain:.08,frequency:120}),wood:mat('#654735'),stone:mat('#59615c'),skin:mat('#ba9672')};
materials.cloth.side=T.DoubleSide;
export function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function box(p,w,h,d,m,x=0,y=0,z=0){return mesh(p,new T.BoxGeometry(w,h,d),m,x,y,z);}
export function ellipsoid(p,x,y,z,sx,sy,sz,m){const o=mesh(p,new T.SphereGeometry(1,16,12),m,x,y,z);o.scale.set(sx,sy,sz);return o;}
export function cylinder(p,top,bottom,height,m,x=0,y=0,z=0,segments=12){return mesh(p,new T.CylinderGeometry(top,bottom,height,segments),m,x,y,z);}
export function joint(parent,x,y,z){const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;}

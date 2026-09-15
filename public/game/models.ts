import * as T from './vendor/three.module.js';
import {surfaceMaterial} from './forms.js';

const mat=(color:T.ColorRepresentation,metalness=0,roughness=.8)=>new T.MeshStandardMaterial({color,metalness,roughness});
export const materials={steel:surfaceMaterial('#819397',{metalness:.66,roughness:.48,grain:.055}),edge:mat('#c4cdc6',.78,.32),dark:surfaceMaterial('#26323a',{metalness:.35,roughness:.72}),leather:surfaceMaterial('#342923',{grain:.12}),gold:surfaceMaterial('#ae8450',{metalness:.64,roughness:.49,grain:.06}),cloth:surfaceMaterial('#722d32',{grain:.08,frequency:120}),wood:mat('#654735'),stone:mat('#59615c'),skin:mat('#ba9672')};
materials.cloth.side=T.DoubleSide;
export function mesh<G extends T.BufferGeometry,M extends T.Material|T.Material[]>(parent:T.Object3D,geometry:G,material:M,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function box<M extends T.Material|T.Material[]>(p:T.Object3D,w:number,h:number,d:number,m:M,x=0,y=0,z=0){return mesh(p,new T.BoxGeometry(w,h,d),m,x,y,z);}
export function ellipsoid<M extends T.Material|T.Material[]>(p:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,m:M){const o=mesh(p,new T.SphereGeometry(1,16,12),m,x,y,z);o.scale.set(sx,sy,sz);return o;}
export function cylinder<M extends T.Material|T.Material[]>(p:T.Object3D,top:number,bottom:number,height:number,m:M,x=0,y=0,z=0,segments=12){return mesh(p,new T.CylinderGeometry(top,bottom,height,segments),m,x,y,z);}
export function joint(parent:T.Object3D,x:number,y:number,z:number){const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;}

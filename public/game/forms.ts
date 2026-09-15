import * as T from './vendor/three.module.js';
export interface LoftSection {y:number;rx:number;rz:number;x?:number;z?:number}
export interface SurfaceOptions {metalness?:number;roughness?:number;grain?:number;frequency?:number}

// Shaped cross-sections give armour and anatomy deliberate silhouettes.
export function loftGeometry(rows:readonly LoftSection[],segments=12){
  const sections=[...rows].sort((a,b)=>a.y-b.y),vertices:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let j=0;j<sections.length;j++)for(let i=0;i<segments;i++){
    const p=sections[j],a=i/segments*Math.PI*2;
    vertices.push((p.x||0)+Math.sin(a)*p.rx,p.y,(p.z||0)+Math.cos(a)*p.rz);uvs.push(i/segments,j/(sections.length-1));
  }
  for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){
    const a=j*segments+i,n=j*segments+(i+1)%segments,b=a+segments,bn=n+segments;
    indices.push(a,n,b,n,bn,b);
  }
  for(const end of [0,sections.length-1]){
    const p=sections[end],c=vertices.length/3;vertices.push(p.x||0,p.y,p.z||0);uvs.push(.5,.5);
    for(let i=0;i<segments;i++){const a=end*segments+i,b=end*segments+(i+1)%segments;indices.push(...(end?[c,a,b]:[c,b,a]));}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function plateGeometry(points:readonly (readonly [number,number])[],depth=.035,bevel=.018){
  const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSegments:1,steps:1,bevelSize:bevel,bevelThickness:bevel});g.translate(0,0,-depth/2);return g;
}
export function surfaceMaterial(color:T.ColorRepresentation,{metalness=0,roughness=.9,grain=.07,frequency=80}:SurfaceOptions={}){
  const m=new T.MeshStandardMaterial({color,metalness,roughness});
  m.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vArtSurface;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArtSurface = position;');
    shader.fragmentShader='varying vec3 vArtSurface;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float artGrain = fract(sin(dot(floor(vArtSurface * ${frequency.toFixed(1)}), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      diffuseColor.rgb *= ${(1-grain).toFixed(3)} + artGrain * ${(grain*2).toFixed(3)};
    `);
  };
  m.customProgramCacheKey=()=>`art-surface-${grain}-${frequency}`;return m;
}
const contactMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:.30}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vUv; uniform float opacity; void main(){float d=length(vUv*2.0-1.0);gl_FragColor=vec4(0.055,0.07,0.065,(1.0-smoothstep(0.12,1.0,d))*opacity);}',polygonOffset:true,polygonOffsetFactor:-1});
export function contactShadow(parent:T.Object3D,w:number,d:number){const s=new T.Mesh(new T.PlaneGeometry(w,d),contactMaterial);s.rotation.x=-Math.PI/2;s.position.y=.016;s.renderOrder=1;parent.add(s);return s;}

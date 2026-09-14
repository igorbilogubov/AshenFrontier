import * as T from './vendor/three.module.js';

function trianglesGeometry(triangles,colors){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(triangles.flat(2),3));
  if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();return g;
}
export function pineGeometry(){
  const triangles=[],colors=[];
  const add=(a,b,c,shade)=>{triangles.push([a,b,c]);const color=new T.Color('#4d6849').multiplyScalar(shade);for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);};
  for(let tier=0;tier<8;tier++)for(let branch=0;branch<8;branch++){
    const a=branch/8*Math.PI*2+tier*.73,r=(1.42-tier*.164)*(1+.13*Math.sin(branch*7+tier*3)),y=1.25+tier*.43;
    const p=(t,side=0,h=0)=>[Math.cos(a)*t*r-Math.sin(a)*side,y+.15-.32*t+h,Math.sin(a)*t*r+Math.cos(a)*side];
    const shade=.76+tier*.04+(branch%3)*.055;
    add(p(0),p(.86,-.022),p(1.08),shade);add(p(0),p(1.08),p(.86,.022),shade*1.08);
    for(let j=0;j<5;j++)for(const side of [-1,1]){
      const t=.14+j*.145,w=(.35-t*.22)*r,base=p(t-.1,0,.04),rib=p(t+.04,side*w*.50,.055),tip=p(t+.28,side*w,-.07),outer=p(t+.29,side*w*.36,-.03);
      add(base,tip,rib,shade*.92);add(rib,tip,outer,shade*1.10);add(base,rib,outer,shade);
      const split=p(t+.12,side*w*1.08,-.085);add(base,split,tip,shade*.82);
    }
  }
  return trianglesGeometry(triangles,colors);
}
export function grassGeometry(){
  const triangles=[],colors=[];
  for(let i=0;i<9;i++){
    const a=i*2.399,h=.22+(i%4)*.053,bend=.10+(i%3)*.02,x=Math.sin(i*4)*.07,z=Math.cos(i*3)*.07,w=.024;
    const p=(y,b,s)=>[x+Math.sin(a)*b+Math.cos(a)*s,y,z+Math.cos(a)*b-Math.sin(a)*s];
    const a0=p(0,0,-w),b0=p(0,0,w),a1=p(h*.58,bend*.3,-w*.5),b1=p(h*.58,bend*.3,w*.5),tip=p(h,bend,0);
    triangles.push([a0,b0,a1],[b0,b1,a1],[a1,b1,tip]);
    for(let j=0;j<9;j++){const c=new T.Color(j<6?'#526745':'#889063').multiplyScalar(.8+i%3*.10);colors.push(c.r,c.g,c.b);}
  }
  return trianglesGeometry(triangles,colors);
}
export function fernGeometry(){
  const triangles=[],colors=[];
  for(let frond=0;frond<7;frond++){
    const a=frond/7*Math.PI*2,scale=.85+(frond%3)*.1;
    const p=(t,side)=>[Math.sin(a)*t*.60*scale+Math.cos(a)*side,Math.sin(t*Math.PI*.86)*.37,Math.cos(a)*t*.60*scale-Math.sin(a)*side];
    for(let i=1;i<9;i++){
      const t=i/10,w=.10*Math.sin(t*Math.PI),base=p(t-.035,0),stem=p(t+.05,0);
      for(const side of [-1,1]){triangles.push([base,p(t+.09,side*w),stem]);const c=new T.Color('#668765').multiplyScalar(.68+t*.35);for(let k=0;k<3;k++)colors.push(c.r,c.g,c.b);}
    }
  }
  return trianglesGeometry(triangles,colors);
}
export function leafGeometry(){
  return trianglesGeometry([[[0,.003,0],[-.055,.016,.10],[0,.018,.23]],[[0,.003,0],[0,.018,.23],[.055,.008,.10]]]);
}
export function windMaterial(clock,strength=.02){
  const m=new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,side:T.DoubleSide});
  m.onBeforeCompile=shader=>{
    shader.uniforms.breezeTime=clock;shader.vertexShader='uniform float breezeTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float phase=0.0;
      #ifdef USE_INSTANCING
        phase=instanceMatrix[3].x*.83+instanceMatrix[3].z*.47;
      #endif
      transformed.x += sin(breezeTime*1.4+phase+position.y*2.0)*${strength.toFixed(3)}*position.y;
    `);
  };m.customProgramCacheKey=()=>`forest-breeze-${strength}`;return m;
}

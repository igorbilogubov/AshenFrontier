/** Reserve the actual HUD height, including wrapped controls and scaled browser text. */
export function bindPanelLayout(){
  const footer=document.querySelector<HTMLElement>('footer'),shortcuts=document.querySelector<HTMLElement>('.hero-shortcuts');
  let scheduled=0,last=-1;
  const measure=()=>{
    scheduled=0;
    const top=Math.min(...[footer,shortcuts].filter((node):node is HTMLElement=>!!node).map(node=>node.getBoundingClientRect().top));
    const clearance=Math.max(0,Math.ceil(innerHeight-top))+12;
    if(Number.isFinite(clearance)&&clearance!==last){document.documentElement.style.setProperty('--hud-clearance',`${clearance}px`);last=clearance;}
  };
  const schedule=()=>{if(!scheduled)scheduled=requestAnimationFrame(measure);};
  const observer=new ResizeObserver(schedule);
  for(const node of [footer,shortcuts])if(node)observer.observe(node);
  addEventListener('resize',schedule);visualViewport?.addEventListener('resize',schedule);
  document.fonts.ready.then(schedule);measure();
}

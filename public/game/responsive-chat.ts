/** A narrow-screen chat drawer that leaves the combat HUD in place. */
export function bindResponsiveChat(){
  const panelNode=document.getElementById('chat-panel');
  const inputNode=document.getElementById('chat-input');
  if(!(panelNode instanceof HTMLElement)||!(inputNode instanceof HTMLInputElement))throw new Error('Missing world chat');
  const panel:HTMLElement=panelNode,input:HTMLInputElement=inputNode;
  const compact=matchMedia('(max-width: 1200px)');
  const toggle=document.createElement('button');
  toggle.id='responsive-chat-toggle';toggle.type='button';toggle.textContent='Чат';
  toggle.setAttribute('aria-label','Открыть чат мира');toggle.setAttribute('aria-controls','chat-panel');toggle.setAttribute('aria-expanded','false');
  document.body.append(toggle);
  let expanded=false,wasCompact=compact.matches;
  function sync(){
    const narrow=compact.matches;
    if(narrow&&!wasCompact)expanded=false;
    wasCompact=narrow;
    toggle.hidden=!narrow;
    panel.classList.toggle('responsive-chat-collapsed',narrow&&!expanded);
    panel.classList.toggle('responsive-chat-open',narrow&&expanded);
    panel.setAttribute('aria-hidden',String(narrow&&!expanded));
    toggle.setAttribute('aria-expanded',String(narrow&&expanded));
    toggle.setAttribute('aria-label',narrow&&expanded?'Свернуть чат мира':'Открыть чат мира');
    if(narrow&&!expanded&&panel.contains(document.activeElement))toggle.focus({preventScroll:true});
    if(!narrow&&document.activeElement===toggle)document.getElementById('scene')?.focus({preventScroll:true});
  }
  function open(){if(!compact.matches)return;expanded=true;sync();input.focus({preventScroll:true});}
  function close(){if(!compact.matches)return;expanded=false;sync();toggle.focus({preventScroll:true});}
  toggle.onclick=()=>{if(expanded)close();else open();};
  compact.addEventListener('change',sync);
  document.addEventListener('keydown',event=>{
    if(!compact.matches||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey)return;
    if(event.code==='Escape'&&expanded){event.preventDefault();event.stopPropagation();close();return;}
    if(event.code!=='Enter'||event.repeat)return;
    const active=document.activeElement;
    if(active===input||active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement||active instanceof HTMLSelectElement)return;
    if(active instanceof HTMLButtonElement&&active!==toggle)return;
    event.preventDefault();event.stopPropagation();open();
  },true);
  sync();
  return {isOpen:()=>compact.matches&&expanded,open,close};
}

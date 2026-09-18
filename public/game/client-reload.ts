export const RELOAD_STORAGE_KEY='ashen-client-reload';
export const RELOAD_TTL_MS=120_000;
export type ReloadResume={heroId:string;afk:boolean;at:number};

type StorageLike={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};

export function storeReloadResume(heroId:string,afk:boolean,storage:StorageLike,now=Date.now()){
  if(!heroId)return;
  storage.setItem(RELOAD_STORAGE_KEY,JSON.stringify({heroId,afk:!!afk,at:now} satisfies ReloadResume));
}

export function readReloadResume(storage:StorageLike,now=Date.now()):ReloadResume|null{
  try{
    const raw=storage.getItem(RELOAD_STORAGE_KEY);if(!raw)return null;
    const data=JSON.parse(raw) as Partial<ReloadResume>;
    if(!data||typeof data.heroId!=='string'||typeof data.at!=='number'){storage.removeItem(RELOAD_STORAGE_KEY);return null;}
    if(now-data.at>RELOAD_TTL_MS){storage.removeItem(RELOAD_STORAGE_KEY);return null;}
    return {heroId:data.heroId,afk:!!data.afk,at:data.at};
  }catch{storage.removeItem(RELOAD_STORAGE_KEY);return null;}
}

export function clearReloadResume(storage:StorageLike){
  storage.removeItem(RELOAD_STORAGE_KEY);
}

export function shouldResumeAfk(resume:ReloadResume|null,heroId:string){
  return !!resume&&!!heroId&&resume.heroId===heroId&&resume.afk;
}

export async function waitUntilHealthy(fetchImpl:typeof fetch,timeoutMs=60_000,now=()=>Date.now()){
  const deadline=now()+timeoutMs;
  while(now()<deadline){
    try{
      const response=await fetchImpl('/health',{cache:'no-store'});
      if(response.ok){
        const body=await response.json() as {ok?:unknown};
        if(body&&body.ok===true)return true;
      }
    }catch{/* Server is still swapping. */}
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  return false;
}

export function reloadPage(){
  if(typeof location!=='undefined'&&typeof location.reload==='function')location.reload();
}

import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {createRemoteJWKSet, jwtVerify} from 'jose';
import type {JWTVerifyGetKey} from 'jose';

export interface AuthAccount {id:string; email:string; name:string}
export interface AuthSession {account:AuthAccount; expiresAt:number; sessionHash:string}
export interface AuthStore {
  upsertGoogleAccount(identity:{sub:string; email:string; name:string}):Promise<AuthAccount>;
  createSession(accountId:string, tokenHash:string, expiresAt:Date):Promise<void>;
  findSession(tokenHash:string):Promise<{account:AuthAccount; expiresAt:number}|null>;
  deleteSession(tokenHash:string):Promise<void>;
}
export interface GoogleAuthOptions {
  publicOrigin?:string;
  clientId?:string;
  clientSecret?:string;
  onSessionRevoked?:(sessionHash:string)=>void|Promise<void>;
  /** Dependency injection for isolated protocol tests, never populated from environment. */
  provider?:{fetch?:typeof fetch; keys?:JWTVerifyGetKey; authorizationEndpoint?:string; tokenEndpoint?:string};
}
const SESSION_MS=30*24*60*60*1000;
const FLOW_MS=10*60*1000;
const COOKIE='ashen_session';
const FLOW_COOKIE='ashen_oauth';
const random=()=>randomBytes(32).toString('base64url');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const same=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function cookie(req:IncomingMessage,name:string):string {
  const matches=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  if(matches.length!==1)return '';
  const value=matches[0].slice(name.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';
}
function loopback(host:string):boolean{return host==='localhost'||host==='127.0.0.1'||host==='[::1]';}
function parseOrigin(value:string):string {
  const url=new URL(value);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw new Error('GAME_PUBLIC_ORIGIN must be an origin without path or credentials');
  if(url.protocol!=='https:'&&!loopback(url.hostname))throw new Error('GAME_PUBLIC_ORIGIN requires HTTPS except for loopback');
  return url.origin;
}
export function createGoogleAuth(store:AuthStore,options:GoogleAuthOptions={}) {
  const rawOrigin=options.publicOrigin??process.env.GAME_PUBLIC_ORIGIN;
  const origin=rawOrigin?parseOrigin(rawOrigin):'';
  const clientId=options.clientId??process.env.GOOGLE_CLIENT_ID??'';
  const clientSecret=options.clientSecret??process.env.GOOGLE_CLIENT_SECRET??'';
  const configured=Boolean(origin&&clientId&&clientSecret);
  const secure=origin.startsWith('https:')||process.env.NODE_ENV==='production';
  const redirectUri=origin+'/auth/google/callback';
  const keys=options.provider?.keys??createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:8000});
  const request=options.provider?.fetch??fetch;
  const pending=new Map<string,{binding:string; nonce:string; verifier:string; expires:number}>();
  function setCookie(res:ServerResponse,name:string,value:string,seconds:number) {
    const previous=res.getHeader('Set-Cookie');
    const values=Array.isArray(previous)?previous:previous?[String(previous)]:[];
    res.setHeader('Set-Cookie',[...values,`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure?'; Secure':''}`]);
  }
  function respond(res:ServerResponse,status:number,body:unknown) {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
    res.end(JSON.stringify(body));
  }
  function redirect(res:ServerResponse,path:string) {
    res.writeHead(303,{Location:path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
  }
  function checkOrigin(req:IncomingMessage):boolean {
    const candidate=req.headers.origin;
    if(!candidate||candidate==='null')return false;
    if(origin)return candidate===origin;
    if(process.env.NODE_ENV==='production')return false;
    // Unconfigured local integration servers may use a dynamic loopback port.
    try {
      const url=new URL(candidate);
      return url.origin===candidate&&url.protocol==='http:'&&loopback(url.hostname)&&url.host===req.headers.host;
    }catch{return false;}
  }
  async function authenticate(req:IncomingMessage):Promise<AuthSession|null> {
    const token=cookie(req,COOKIE);if(!token)return null;
    const sessionHash=hash(token),stored=await store.findSession(sessionHash);
    if(!stored||stored.expiresAt<=Date.now())return null;
    return {...stored,sessionHash};
  }
  async function issueSession(account:AuthAccount,res:ServerResponse):Promise<void> {
    const token=random();
    await store.createSession(account.id,hash(token),new Date(Date.now()+SESSION_MS));
    setCookie(res,COOKIE,token,SESSION_MS/1000);
  }
  async function handle(req:IncomingMessage,res:ServerResponse):Promise<boolean> {
    const url=new URL(req.url||'/', 'http://internal.invalid');
    if(!['/auth/google','/auth/google/callback','/auth/logout'].includes(url.pathname))return false;
    const method=url.pathname==='/auth/logout'?'POST':'GET';
    if(req.method!==method){res.setHeader('Allow',method);respond(res,405,{error:'method_not_allowed'});return true;}
    if(url.pathname==='/auth/logout') {
      if(!checkOrigin(req)){respond(res,403,{error:'invalid_origin'});return true;}
      const session=await authenticate(req);
      if(session){await store.deleteSession(session.sessionHash);await options.onSessionRevoked?.(session.sessionHash);}
      setCookie(res,COOKIE,'',0);respond(res,200,{ok:true});return true;
    }
    if(!configured){respond(res,503,{error:'google_not_configured',message:'Вход через Google пока не настроен. Попробуйте позже.'});return true;}
    if(url.pathname==='/auth/google') {
      // Reject cross-site subresource initiation; normal external navigation is allowed.
      if(req.headers['sec-fetch-dest']&&req.headers['sec-fetch-dest']!=='document'){respond(res,403,{error:'invalid_navigation'});return true;}
      for(const [state,flow] of pending)if(flow.expires<=Date.now())pending.delete(state);
      if(pending.size>=2048){respond(res,429,{error:'try_again_later'});return true;}
      const state=random(),binding=random(),nonce=random(),verifier=random();
      pending.set(state,{binding:hash(binding),nonce,verifier,expires:Date.now()+FLOW_MS});
      setCookie(res,FLOW_COOKIE,binding,FLOW_MS/1000);
      const authorization=new URL(options.provider?.authorizationEndpoint??'https://accounts.google.com/o/oauth2/v2/auth');
      authorization.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
      redirect(res,authorization.href);return true;
    }
    const state=url.searchParams.get('state')||'',binding=cookie(req,FLOW_COOKIE),flow=pending.get(state);
    if(!flow||flow.expires<=Date.now()||!binding||!same(flow.binding,hash(binding))){redirect(res,'/?auth_error=invalid_state');return true;}
    pending.delete(state);setCookie(res,FLOW_COOKIE,'',0);
    if(url.searchParams.has('error')){redirect(res,'/?auth_error=cancelled');return true;}
    const code=url.searchParams.get('code');
    if(!code||code.length>4096){redirect(res,'/?auth_error=invalid_response');return true;}
    try {
      const response=await request(options.provider?.tokenEndpoint??'https://oauth2.googleapis.com/token',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:flow.verifier}),signal:AbortSignal.timeout(10000),redirect:'error',
      });
      if(!response.ok)throw new Error('Token exchange failed');
      const result:unknown=await response.json();
      if(!result||typeof result!=='object'||!('id_token' in result)||typeof result.id_token!=='string'||result.id_token.length>16384)throw new Error('Missing ID token');
      const {payload}=await jwtVerify(result.id_token,keys,{algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,requiredClaims:['sub','iss','aud','exp','iat','nonce'],maxTokenAge:'10m',clockTolerance:5});
      if(payload.nonce!==flow.nonce||payload.email_verified!==true||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255||typeof payload.email!=='string'||payload.email.length>320||!payload.email.includes('@')||(payload.azp!==undefined&&payload.azp!==clientId))throw new Error('Invalid identity');
      const account=await store.upsertGoogleAccount({sub:payload.sub,email:payload.email,name:typeof payload.name==='string'?payload.name.slice(0,160):'Игрок'});
      const previous=await authenticate(req);
      await issueSession(account,res);
      if(previous){await store.deleteSession(previous.sessionHash);await options.onSessionRevoked?.(previous.sessionHash);}
      redirect(res,'/');
    }catch{redirect(res,'/?auth_error=login_failed');}
    return true;
  }
  return {configured,authenticate,handle,checkOrigin,issueSession};
}

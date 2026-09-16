import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalJWKSet, exportJWK, generateKeyPair, SignJWT} from 'jose';
import {createGoogleAuth} from '../dist/auth/google.js';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const {privateKey:wrongPrivateKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='test';
const keys=createLocalJWKSet({keys:[jwk]});
const response=()=>({headers:{},status:0,body:'',getHeader(k){return this.headers[k];},setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);},end(body=''){this.body=body;}});
function fixture(overrides={}) {
 const sessions=new Map(),accounts=[];let claims={},flow;
 const store={async upsertGoogleAccount(a){accounts.push(a);return{id:'account-1',email:a.email,name:a.name};},async createSession(id,h,e){sessions.set(h,{account:{id,email:'test@example.com',name:'Test'},expiresAt:e.getTime()});},async findSession(h){return sessions.get(h)||null;},async deleteSession(h){sessions.delete(h);}};
 const auth=createGoogleAuth(store,{publicOrigin:'https://game.example.com',clientId:'test-client',clientSecret:'private',provider:{keys,fetch:async(_url,opts)=>{
   assert.equal(opts.body.get('grant_type'),'authorization_code');
   assert.equal(opts.body.get('redirect_uri'),'https://game.example.com/auth/google/callback');
   const token=await new SignJWT({nonce:flow.searchParams.get('nonce'),email:'test@example.com',email_verified:true,name:'Test',...claims}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(claims.iss??'https://accounts.google.com').setAudience(claims.aud??'test-client').setSubject('google-subject').setIssuedAt().setExpirationTime(claims.exp??'5m').sign(claims.badSignature?wrongPrivateKey:privateKey);
   return new Response(JSON.stringify({id_token:token}),{status:200});
 }},...overrides});
 return {auth,sessions,accounts,setClaims(v){claims=v;},async start(){const res=response();await auth.handle({url:'/auth/google',method:'GET',headers:{}},res);flow=new URL(res.headers.Location);return {state:flow.searchParams.get('state'),cookie:res.headers['Set-Cookie'][0].split(';')[0],url:flow};},async callback(start,headers={}){const res=response();await auth.handle({url:'/auth/google/callback?code=test-code&state='+start.state,method:'GET',headers:{cookie:start.cookie,...headers}},res);return res;}};
}
test('Google flow validates signed identity, binds browser and issues persistent HttpOnly session',async()=>{
 const f=fixture(),start=await f.start();
 assert.equal(start.url.searchParams.get('code_challenge_method'),'S256');
 const res=await f.callback(start);assert.equal(res.headers.Location,'/');assert.equal(f.accounts.length,1);
 const c=res.headers['Set-Cookie'].find(c=>c.startsWith('ashen_session='));assert.match(c,/HttpOnly; SameSite=Lax/);assert.match(c,/Secure/);
 const session=await f.auth.authenticate({headers:{cookie:c.split(';')[0]}});assert.equal(session.account.id,'account-1');assert.equal(session.sessionHash.length,64);
 assert.equal((await f.callback(start)).headers.Location,'/?auth_error=invalid_state');
});
test('Callback without browser binding is rejected without consuming legitimate flow',async()=>{
 const f=fixture(),start=await f.start();assert.equal((await f.callback(start,{cookie:''})).headers.Location,'/?auth_error=invalid_state');assert.equal(f.accounts.length,0);assert.equal((await f.callback(start)).headers.Location,'/');
});
for(const [name,claims] of [['nonce',{nonce:'forged'}],['email verification',{email_verified:false}],['authorized party',{azp:'other-client'}],['audience',{aud:'other-client'}],['issuer',{iss:'https://evil.example'}],['expiry',{exp:1}],['signature',{badSignature:true}]])test('Rejects invalid '+name,async()=>{
 const f=fixture();f.setClaims(claims);assert.equal((await f.callback(await f.start())).headers.Location,'/?auth_error=login_failed');assert.equal(f.sessions.size,0);
});
test('Logout requires same origin and revokes session',async()=>{
 let revoked='';const f=fixture({onSessionRevoked:h=>{revoked=h;}}),logged=await f.callback(await f.start());const cookie=logged.headers['Set-Cookie'].find(c=>c.startsWith('ashen_session=')).split(';')[0];
 const bad=response();await f.auth.handle({url:'/auth/logout',method:'POST',headers:{cookie,origin:'https://evil.example'}},bad);assert.equal(bad.status,403);assert.equal(f.sessions.size,1);
 const good=response();await f.auth.handle({url:'/auth/logout',method:'POST',headers:{cookie,origin:'https://game.example.com'}},good);assert.equal(good.status,200);assert.equal(f.sessions.size,0);assert.equal(revoked.length,64);
});
test('Missing Google configuration fails closed; origin does not trust host',async()=>{
 const f=fixture({clientId:'',clientSecret:''});const res=response();await f.auth.handle({url:'/auth/google',method:'GET',headers:{}},res);assert.equal(res.status,503);assert.equal(f.auth.checkOrigin({headers:{origin:'https://evil.example',host:'evil.example'}}),false);
});
test('Duplicate session cookie and expired session are rejected',async()=>{
 const f=fixture(),logged=await f.callback(await f.start()),cookie=logged.headers['Set-Cookie'].find(c=>c.startsWith('ashen_session=')).split(';')[0];
 assert.equal(await f.auth.authenticate({headers:{cookie:cookie+'; '+cookie}}),null);
 for(const s of f.sessions.values())s.expiresAt=0;
 assert.equal(await f.auth.authenticate({headers:{cookie}}),null);
});

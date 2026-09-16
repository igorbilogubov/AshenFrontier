import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {newHero,persistentHero} from '../dist/world.js';
import {TRAVEL_PORTALS} from '../dist/public/game/travel.js';
import {locationAt} from '../dist/public/game/world-layout.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until,testPlayer} from './helpers/network.mjs';
async function connect(server,fixture){
 const login=await testPlayer(server,{fixture}),c={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),states:[]};
 c.ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='state'){c.state=m;c.states.push(m);}});
 await once(c.ws,'open');c.send=m=>c.ws.send(JSON.stringify(m));c.send({type:'join',protocol:3,heroId:login.heroId});await until(()=>c.state);return c;
}
async function close(c){if(!c||c.ws.readyState===WebSocket.CLOSED)return;const done=once(c.ws,'close');c.ws.close();await done;}
test('authenticated paid travel persists exact gold and destination; disconnected movement does not resume',{skip:!hasTestDatabase},async()=>{
 const db=await createTestDatabase(),fixture='paid-travel',source=TRAVEL_PORTALS.find(p=>p.location==='forest'),destination=TRAVEL_PORTALS.find(p=>p.location==='snow'),hero=newHero('Портал QA');Object.assign(hero,{x:source.x,z:source.z,level:10,gold:500});
 const clients=[];let server;
 try{
  await db.seed(fixture,persistentHero(hero));
  server=await startTestServer(db);const c=await connect(server,fixture);clients.push(c);
  c.send({type:'travel',portalId:source.id,destinationId:destination.id,fee:0});c.send({type:'travelOpen',portalId:source.id});await until(()=>c.state.self.travelPortalId===source.id);assert.equal(c.state.self.gold,500);assert.equal(locationAt(c.state.self),'forest');
  c.send({type:'travel',portalId:source.id,destinationId:destination.id,fee:0});c.send({type:'travel',portalId:source.id,destinationId:destination.id,fee:0});await until(()=>locationAt(c.state.self)==='snow');assert.equal(c.state.self.gold,500-destination.fee);
  await close(c);await stopTestServer(server);const saved=(await db.load(fixture)).hero;assert.equal(saved.gold,500-destination.fee);assert.equal(locationAt(saved),'snow');assert(!('travelPortalId' in saved));
  server=await startTestServer(db);const again=await connect(server,fixture);clients.push(again);assert.equal(again.state.self.gold,500-destination.fee);assert(!again.state.self.travelPortalId);
  again.send({type:'moveTo',target:{x:280,z:11}});await until(()=>again.state.self.navigationTarget);await close(again);await stopTestServer(server);const stopped=(await db.load(fixture)).hero;assert(!('navigation' in stopped));
  server=await startTestServer(db);const final=await connect(server,fixture);clients.push(final);assert.equal(final.state.self.navigationTarget,null);assert.equal(final.state.self.attackTargetId,null);
 }finally{for(const c of clients)await close(c);await stopTestServer(server);await db.close();}
});

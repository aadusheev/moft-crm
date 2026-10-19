import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import * as security from '../lib/bridge-security.mjs';
const source=readFileSync(new URL('../app/api/source-settings/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route(user,saved=null){
 let writes=0,reads=0;
 const exports={};
 const mocks={
  '@/lib/crm-auth':{getCRMUser:async()=>user},
  '@/db':{getDb:()=>{writes++;throw Error('Unexpected database mutation');}},
  '@/db/schema':{sourceSettings:{},clients:{}},
  'drizzle-orm':{eq:()=>null,isNotNull:()=>null},
  '@/lib/source-settings':{canManageSource:e=>e==='owner@example.test',settingsMaster:()=>'',savedSource:async()=>saved,settingsEnv:()=>({MOFT_BRIDGE_SECRET:'s'.repeat(64)}),activeSource:async()=>({secret:'s'.repeat(64)})},
  '@/lib/bridge-security.mjs':{...security,callBridge:async()=>{reads++;return {ok:true,leads:[]};}},
 };
 new Function('require','exports',js)(name=>{if(!(name in mocks))throw Error(name);return mocks[name];},exports);
 return {...exports,counters:()=>({writes,reads})};
}
const request=(body,origin='https://crm.example.test')=>new Request('https://crm.example.test/api/source-settings',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('anonymous and non-owner cannot read or change settings',async()=>{
 for(const [user,status] of [[null,401],[{email:'staff@example.test'},403]]){
  const api=route(user);assert.equal((await api.GET()).status,status);assert.equal((await api.POST(request({action:'save'}))).status,status);assert.deepEqual(api.counters(),{writes:0,reads:0});
 }
});
test('owner GET never returns secret or ciphertext',async()=>{
 const api=route({email:'owner@example.test',role:'owner'},{bridgeUrl:'https://script.google.com/macros/s/test/exec',secretCipher:'CONFIDENTIAL',enabled:1,revision:2,lastChecked:''});
 const r=await api.GET(),text=await r.text();assert.equal(r.status,200);assert.ok(!text.includes('CONFIDENTIAL'));assert.ok(!text.includes('s'.repeat(64)));assert.equal(JSON.parse(text).canSave,false);
});
test('cross-origin and stale settings changes are rejected',async()=>{
 const api=route({email:'owner@example.test',role:'owner'});assert.equal((await api.POST(request({action:'save'},'https://evil.example'))).status,403);assert.equal((await api.POST(request({action:'save',revision:99}))).status,409);assert.deepEqual(api.counters(),{writes:0,reads:0});
});
test('connection test only reads and save without encryption key cannot mutate',async()=>{
 const api=route({email:'owner@example.test',role:'owner'}),data={bridgeUrl:'https://script.google.com/macros/s/test/exec',secret:'s'.repeat(64),revision:0};
 assert.equal((await api.POST(request({...data,action:'test'}))).status,200);
 assert.equal((await api.POST(request({...data,action:'save'}))).status,400);
 assert.deepEqual(api.counters(),{writes:0,reads:2});
});

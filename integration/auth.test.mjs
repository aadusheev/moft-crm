import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {authService,token,digest,readToken,sessionCookie,hashPassword,verifyPassword,TTL} from '../lib/auth-core.mjs';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return sqlite.prepare(sql).run(...args);}};},async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 let now=Date.now();const code=token(),bootstrap={email:'owner@example.test',tokenHash:digest(code),expiresAt:now+86400000};
 return {sqlite,code,bootstrap,db,service:authService(db,bootstrap,()=>now),advance:n=>now+=n};
}
test('owner activation is private, single-use and preserves existing business data',async()=>{
 const f=fixture();try{
  f.sqlite.exec('CREATE TABLE clients (id TEXT, name TEXT); INSERT INTO clients VALUES (\'1\',\'Existing\')');
  assert.equal(await f.service.setup(f.bootstrap.email,'long-password-123',token()),null);
  assert.equal(await f.service.setup('other@example.test','long-password-123',f.code),null);
  const s=await f.service.setup(f.bootstrap.email,'long-password-123',f.code);assert.ok(s);
  assert.equal((await f.service.user(s)).role,'owner');
  assert.equal(await f.service.setup(f.bootstrap.email,'different-password',f.code),null);
  assert.ok(await f.service.login(f.bootstrap.email,'long-password-123'));
  assert.equal(await f.service.login(f.bootstrap.email,'different-password'),null);
  assert.equal(f.sqlite.prepare('SELECT name FROM clients').get().name,'Existing');
  assert.ok(!JSON.stringify(f.sqlite.prepare('SELECT * FROM crm_auth_sessions').all()).includes(s));
 }finally{f.sqlite.close();}
});
test('sessions reject forged tokens, expire, and logout revokes immediately',async()=>{
 const f=fixture();try{const s=await f.service.setup(f.bootstrap.email,'long-password-123',f.code);
  assert.equal(await f.service.user(token()),null);await f.service.logout(s);assert.equal(await f.service.user(s),null);
  const s2=await f.service.login(f.bootstrap.email,'long-password-123');f.advance(TTL+1);assert.equal(await f.service.user(s2),null);
 }finally{f.sqlite.close();}
});
test('employee invitations bind email and role; replacement invalidates old invite',async()=>{
 const f=fixture();try{const first=await f.service.invite('staff@example.test'),second=await f.service.invite('staff@example.test');
  assert.equal(await f.service.setup('staff@example.test','long-password-123',first),null);
  assert.equal(await f.service.setup(f.bootstrap.email,'long-password-123',second),null);
  const s=await f.service.setup('staff@example.test','long-password-123',second);assert.equal((await f.service.user(s)).role,'staff');
  assert.equal(await f.service.setup('staff@example.test','long-password-123',second),null);
 }finally{f.sqlite.close();}
});
test('expired bootstrap cannot establish an account; rate limits survive service instances',async()=>{
 const f=fixture();try{f.advance(86400001);assert.equal(await f.service.setup(f.bootstrap.email,'long-password-123',f.code),null);
  for(let i=0;i<10;i++)assert.equal(await f.service.limit(f.bootstrap.email),true);
  assert.equal(await f.service.limit(f.bootstrap.email),false);f.advance(900001);assert.equal(await f.service.limit(f.bootstrap.email),true);
 }finally{f.sqlite.close();}
});
test('passwords salted, cookie hardened, duplicate cookies rejected',()=>{
 const p='a-long-random-password',a=hashPassword(p),b=hashPassword(p);assert.notEqual(a,b);assert.ok(verifyPassword(p,a));assert.ok(!verifyPassword(p+'x',a));
 const t=token(),cookie=sessionCookie(t);for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/'])assert.ok(cookie.includes(flag));
 assert.equal(readToken(cookie),t);assert.equal(readToken(cookie+'; '+cookie),null);assert.equal(readToken('__Host-moft_session=forged'),null);
});
test('server authentication ignores spoofed upstream identity headers',async()=>{
 const source=readFileSync(new URL('../lib/crm-auth.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};let requested;
 new Function('require','exports',compiled)(name=>{
  if(name==='next/headers')return {headers:async()=>new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'})};
  if(name==='cloudflare:workers')return {env:{DB:{}}};
  if(name==='./owner-bootstrap.json')return {default:{}};
  if(name==='./auth-core.mjs')return {readToken,authService:()=>({user:async value=>{requested=value;return null;}})};
  throw Error(name);
 },exports);
 assert.equal(await exports.getCRMUser(),null);assert.equal(requested,null);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {validateBridge,encryptSecret,decryptSecret,callBridge,validateLeads} from '../lib/bridge-security.mjs';
const url='https://script.google.com/macros/s/testDeployment/exec',secret='s'.repeat(64),master='m'.repeat(64);
test('encrypts secret, unique IV, refuses wrong key and tampering',async()=>{
 const a=await encryptSecret(secret,master),b=await encryptSecret(secret,master);
 assert.notEqual(a,b);assert.ok(!a.includes(secret));assert.equal(await decryptSecret(a,master),secret);
 await assert.rejects(decryptSecret(a,'x'.repeat(64)));
 const corrupted=JSON.parse(a);corrupted.data[0]^=1;await assert.rejects(decryptSecret(JSON.stringify(corrupted),master));
 await assert.rejects(encryptSecret(secret,''));
});
test('rejects non-Google destinations and short keys',()=>{
 for(const target of ['http://localhost/exec','https://script.google.com.evil.test/macros/s/a/exec','https://docs.google.com/spreadsheets/d/a','https://script.google.com/macros/s/a/exec?x=1'])assert.throws(()=>validateBridge(target,secret));
 assert.throws(()=>validateBridge(url,'short'));validateBridge(url,secret);
});
test('rejects incomplete lead data and duplicate IDs',()=>{
 const l={id:'a',name:'Test',contact:'',request:'',createdAt:'',status:'Не обработан',saleStatus:'',notes:''};
 assert.equal(validateLeads([l]),1);assert.throws(()=>validateLeads([l,l]));assert.throws(()=>validateLeads([{id:'a',name:'Test'}]));
});
test('signed request handles Cyrillic and never sends secret or POST to redirect',async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(input,opts)=>{calls.push({input,opts});return calls.length===1?new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?token=test'}}):Response.json({ok:true,leads:[]});};
  await callBridge(url,secret,'list',{label:'Кириллица'});
  const sent=JSON.parse(calls[0].opts.body);assert.ok(!calls[0].opts.body.includes(secret));assert.equal(JSON.parse(sent.body).label,'Кириллица');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  assert.ok(await crypto.subtle.verify('HMAC',key,Buffer.from(sent.signature,'hex'),new TextEncoder().encode(sent.timestamp+'.'+sent.body)));
  assert.equal(calls[1].opts.method,'GET');assert.equal(calls[1].opts.body,undefined);assert.equal(calls[1].opts.headers,undefined);
 }finally{globalThis.fetch=original;}
});
test('rejects hostile redirect and masks bridge errors',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});await assert.rejects(callBridge(url,secret,'list'));
  globalThis.fetch=async()=>Response.json({ok:false,error:secret});await assert.rejects(callBridge(url,secret,'list'),e=>!e.message.includes(secret));
 }finally{globalThis.fetch=original;}
});
test('settings migration preserves client data and can store encrypted key',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const f of ['0000_violet_ultimo.sql','0001_wakeful_retro_girl.sql'])db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  db.exec("INSERT INTO clients (id,name,contact,source,stage,next_action,next_date,created_at,updated_at) VALUES ('test','Test','','Свой поиск','Новый','','','','')");
  const before=db.prepare('SELECT * FROM clients').all();
  db.exec(readFileSync(new URL('../drizzle/0002_source_settings.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO source_settings (id,bridge_url,secret_cipher,last_checked,updated_by) VALUES (?,?,?,?,?)').run('sheet',url,await encryptSecret(secret,master),'','owner@example.test');
  assert.deepEqual(db.prepare('SELECT * FROM clients').all(),before);assert.equal(db.prepare('SELECT revision FROM source_settings').get().revision,1);
 }finally{db.close();}
});

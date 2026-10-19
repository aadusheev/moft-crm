import {scryptSync,randomBytes,createHash,timingSafeEqual} from 'node:crypto';

export const COOKIE='__Host-moft_session';
export const TTL=8*60*60*1000;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
export function validPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=128;}
export function hashPassword(password){
 const salt=randomBytes(16).toString('hex');
 return `scrypt-v1:${salt}:${scryptSync(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex')}`;
}
export function verifyPassword(password,hash){
 const [version,salt,expected]=String(hash||'').split(':');
 const valid=version==='scrypt-v1'&&/^[a-f0-9]{32}$/.test(salt)&&/^[a-f0-9]{64}$/.test(expected);
 const derived=scryptSync(password,valid?salt:'0'.repeat(32),32,{N:32768,r:8,p:3,maxmem:64*1024*1024});
 return timingSafeEqual(derived,Buffer.from(valid?expected:'0'.repeat(64),'hex'))&&valid;
}
export function readToken(cookie){
 const matches=String(cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
 if(matches.length!==1)return null;
 const value=matches[0].slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value)?value:null;
}
export function sessionCookie(value,maxAge=TTL/1000){return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;}
export const authDDL=[
 'CREATE TABLE IF NOT EXISTS crm_auth_users (email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN (\'owner\',\'staff\')), created_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS crm_auth_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS crm_auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS crm_auth_invites (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL)',
];
export function authService(db,bootstrap,clock=Date.now){
 let ready;
 async function init(){if(!ready)ready=db.batch(authDDL.map(sql=>db.prepare(sql))).catch(e=>{ready=null;throw e;});await ready;}
 async function user(raw){
  if(!raw||!/^[a-f0-9]{64}$/.test(raw))return null;
  await init();return db.prepare('SELECT u.email,u.role FROM crm_auth_sessions s JOIN crm_auth_users u ON u.email=s.email WHERE s.token_hash=? AND s.expires_at>?').bind(digest(raw),clock()).first();
 }
 async function limit(email){
  await init();const now=clock(),window=Math.floor(now/900000);
  for(const [key,max] of [['all',100],[digest(email),10]]){
   const row=await db.prepare('INSERT INTO crm_auth_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key+':'+window,(window+1)*900000).first();
   if(row.count>max)return false;
  }
  await db.batch([db.prepare('DELETE FROM crm_auth_attempts WHERE expires_at<?').bind(now-900000),db.prepare('DELETE FROM crm_auth_sessions WHERE expires_at<?').bind(now)]);
  return true;
 }
 async function issue(email){
  const raw=token();await db.prepare('INSERT INTO crm_auth_sessions (token_hash,email,expires_at) VALUES (?,?,?)').bind(digest(raw),email,clock()+TTL).run();return raw;
 }
 async function login(email,password){
  await init();const row=await db.prepare('SELECT password_hash FROM crm_auth_users WHERE email=?').bind(email).first();
  if(!verifyPassword(password,row?.password_hash))return null;return issue(email);
 }
 async function setup(email,password,code){
  await init();if(!/^[a-f0-9]{64}$/.test(code))return null;
  const codeHash=digest(code);
  if(email===bootstrap.email&&clock()<bootstrap.expiresAt&&codeHash===bootstrap.tokenHash){
   // Only one insert can win; bootstrap can never overwrite an account/password.
   const result=await db.prepare("INSERT INTO crm_auth_users (email,password_hash,role,created_at) VALUES (?,?,'owner',?) ON CONFLICT(email) DO NOTHING RETURNING email").bind(email,hashPassword(password),clock()).first();
   return result?issue(email):null;
  }
  const invitation=await db.prepare('SELECT email FROM crm_auth_invites WHERE token_hash=? AND email=? AND expires_at>?').bind(codeHash,email,clock()).first();
  if(!invitation)return null;
  const result=await db.prepare("INSERT INTO crm_auth_users (email,password_hash,role,created_at) SELECT ?,?,'staff',? WHERE EXISTS (SELECT 1 FROM crm_auth_invites WHERE token_hash=? AND email=? AND expires_at>?) ON CONFLICT(email) DO NOTHING RETURNING email").bind(email,hashPassword(password),clock(),codeHash,email,clock()).first();
  if(!result)return null;
  await db.prepare('DELETE FROM crm_auth_invites WHERE email=?').bind(email).run();return issue(email);
 }
 async function invite(email){
  await init();if(await db.prepare('SELECT email FROM crm_auth_users WHERE email=?').bind(email).first())return null;
  const raw=token();await db.prepare('INSERT INTO crm_auth_invites (token_hash,email,expires_at) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').bind(digest(raw),email,clock()+7*86400000).run();return raw;
 }
 async function logout(raw){if(raw){await init();await db.prepare('DELETE FROM crm_auth_sessions WHERE token_hash=?').bind(digest(raw)).run();}}
 return {init,user,limit,login,setup,invite,logout};
}

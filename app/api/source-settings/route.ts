import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getDb} from '@/db';
import {clients,sourceSettings} from '@/db/schema';
import {eq,isNotNull} from 'drizzle-orm';
import {canManageSource,settingsMaster,savedSource,settingsEnv,activeSource} from '@/lib/source-settings';
import {callBridge,encryptSecret,decryptSecret,validateBridge,validateLeads} from '@/lib/bridge-security.mjs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){
 const user=await getChatGPTUser();if(!user)return json({error:'Нужно войти'},401);
 if(!canManageSource(user.email))return json({error:'Подключением управляет владелец CRM'},403);
 try{
  const saved=await savedSource(),e=settingsEnv();
  return json({bridgeUrl:saved?.bridgeUrl||e.MOFT_BRIDGE_URL||'',hasSecret:!!(saved?.secretCipher||e.MOFT_BRIDGE_SECRET),enabled:saved?!!saved.enabled:!!(e.MOFT_BRIDGE_URL&&e.MOFT_BRIDGE_SECRET),canSave:settingsMaster().length>=32,revision:saved?.revision||0,lastChecked:saved?.lastChecked||''});
 }catch{return json({error:'Настройки недоступны. Проверь миграцию базы на сервере.'},503);}
}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Нужно войти'},401);
 if(!canManageSource(user.email))return json({error:'Подключением управляет владелец CRM'},403);
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Недопустимый источник'},403);
 if(Number(req.headers.get('content-length')||0)>8192)return json({error:'Слишком большой запрос'},413);
 try{
  const raw=await req.text();if(raw.length>8192)return json({error:'Слишком большой запрос'},413);
  const b=JSON.parse(raw);if(!['test','save','disable'].includes(b.action))return json({error:'Неизвестное действие'},400);
  const saved=await savedSource();
  if(b.revision!==(saved?.revision||0))return json({error:'Настройки уже изменены. Закрой и открой окно снова.'},409);
  if(b.action==='disable'){
   if(!saved)return json({error:'Подключение через переменные сервера нужно сначала сохранить здесь.'},400);
   const changed=await getDb().update(sourceSettings).set({enabled:0,revision:saved.revision+1,updatedBy:user.email}).where(eq(sourceSettings.revision,saved.revision)).returning();
   return changed.length?json({ok:true}):json({error:'Настройки изменились. Обнови окно.'},409);
  }
  const url=typeof b.bridgeUrl==='string'?b.bridgeUrl.trim():'';
  const secret=typeof b.secret==='string'&&b.secret?b.secret:(saved?await decryptSecret(saved.secretCipher,settingsMaster()):(await activeSource())?.secret)||'';
  validateBridge(url,secret);
  const currentUrl=saved?.bridgeUrl||settingsEnv().MOFT_BRIDGE_URL;
  if(currentUrl&&url!==currentUrl&&(await getDb().select({id:clients.id}).from(clients).where(isNotNull(clients.externalId)).limit(1)).length)return json({error:'Есть связанные лиды. Смена источника требует отдельного переноса, чтобы не смешать таблицы.'},409);
  const data=await callBridge(url,secret,'list');const count=validateLeads(data.leads);
  if(b.action==='test')return json({ok:true,count});
  const secretCipher=await encryptSecret(secret,settingsMaster());
  const value={id:'sheet',bridgeUrl:url,secretCipher,enabled:1,revision:(saved?.revision||0)+1,lastChecked:new Date().toISOString(),updatedBy:user.email};
  const changed=saved?await getDb().update(sourceSettings).set(value).where(eq(sourceSettings.revision,saved.revision)).returning():await getDb().insert(sourceSettings).values(value).onConflictDoNothing().returning();
  return changed.length?json({ok:true,count}):json({error:'Настройки изменились. Обнови окно.'},409);
 }catch{return json({error:'Подключение не сохранено. Проверь адрес моста, ключ, доступ Google и CRM_SETTINGS_KEY на сервере.'},400);}
}


import {env} from 'cloudflare:workers';
import {getDb} from '@/db';
import {sourceSettings} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {decryptSecret} from './bridge-security.mjs';
export function settingsEnv(){return env as unknown as Record<string,string>;}
export function settingsMaster(){return settingsEnv().CRM_SETTINGS_KEY||'';}
export function canManageSource(email:string){
 const owners=(settingsEnv().CRM_ADMIN_EMAILS||'aadusheev@gmail.com').split(',').map(s=>s.trim().toLowerCase());
 return owners.includes(email.toLowerCase());
}
export async function savedSource(){return (await getDb().select().from(sourceSettings).where(eq(sourceSettings.id,'sheet')))[0];}
export async function activeSource(){
 const saved=await savedSource();
 if(saved){if(!saved.enabled)return null;return {url:saved.bridgeUrl,secret:await decryptSecret(saved.secretCipher,settingsMaster())};}
 const e=settingsEnv();return e.MOFT_BRIDGE_URL&&e.MOFT_BRIDGE_SECRET?{url:e.MOFT_BRIDGE_URL,secret:e.MOFT_BRIDGE_SECRET}:null;
}

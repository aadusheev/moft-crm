import {env} from 'cloudflare:workers';
export type SheetFields={status:string,saleStatus:string,notes:string};
export type SheetLead=SheetFields & {id:string,name:string,contact:string,request:string,createdAt:string};
export function bridgeReady(){const e=env as unknown as Record<string,string>;return !!(e.MOFT_BRIDGE_URL&&e.MOFT_BRIDGE_SECRET);}
export async function sheetCall(action:string,payload:Record<string,unknown>={}){
 const e=env as unknown as Record<string,string>;
 if(!bridgeReady())throw Error('Подключение MOFT.RACE ещё не настроено');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(e.MOFT_BRIDGE_URL))throw Error('Некорректный адрес подключения');
 const body=JSON.stringify({action,...payload}).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')),timestamp=Date.now().toString();
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(e.MOFT_BRIDGE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+body)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const r=await fetch(e.MOFT_BRIDGE_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({timestamp,body,signature}),signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Google временно недоступен');
 const data=await r.json() as {ok:boolean,error?:string,leads?:SheetLead[],fields?:SheetFields};
 if(!data.ok)throw Error(data.error||'Ошибка обмена с таблицей');return data;
}
export const fields=(c:SheetFields):SheetFields=>({status:c.status,saleStatus:c.saleStatus,notes:c.notes});

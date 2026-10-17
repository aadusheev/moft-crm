import {activeSource} from './source-settings';
import {callBridge} from './bridge-security.mjs';
export type SheetFields={status:string,saleStatus:string,notes:string};
export type SheetLead=SheetFields & {id:string,name:string,contact:string,request:string,createdAt:string};
export async function bridgeReady(){try{return !!await activeSource();}catch{return false;}}
export async function sheetCall(action:string,payload:Record<string,unknown>={}){
 const source=await activeSource();
 if(!source)throw Error('Подключение MOFT.RACE ещё не настроено');
 return await callBridge(source.url,source.secret,action,payload) as {ok:boolean,error?:string,leads?:SheetLead[],fields?:SheetFields};
}
export const fields=(c:SheetFields):SheetFields=>({status:c.status,saleStatus:c.saleStatus,notes:c.notes});

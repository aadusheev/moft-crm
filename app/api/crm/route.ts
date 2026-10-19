import {getCRMUser} from '@/lib/crm-auth';
import {getDb} from '@/db';
import {clients,events,sales,syncState} from '@/db/schema';
import {desc,eq,and,sql} from 'drizzle-orm';
import {statuses,saleStatuses,sources,dateKey} from '@/lib/crm';
import {bridgeReady,sheetCall,fields} from '@/lib/sheet-bridge';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const text=(x:unknown,max=2000)=>typeof x==='string'?x.trim().slice(0,max):'';
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
async function push(id:string){
 const db=getDb(),c=(await db.select().from(clients).where(eq(clients.id,id)))[0];if(!c?.externalId||!c.pending)return;
 try{
  const target=fields(c);await sheetCall('update',{id:c.externalId,expected:JSON.parse(c.remoteSnapshot),fields:target});
  await db.update(clients).set({pending:0,syncError:'',remoteSnapshot:JSON.stringify(target)}).where(and(eq(clients.id,id),eq(clients.version,c.version)));
 }catch(e){await db.update(clients).set({syncError:(e as Error).message}).where(and(eq(clients.id,id),eq(clients.version,c.version)));}
}
export async function GET(){
 if(!await getCRMUser())return json({error:'Нужно войти'},401);
 try{const db=getDb();return json({clients:await db.select().from(clients).orderBy(desc(clients.updatedAt)),events:await db.select().from(events).orderBy(desc(events.createdAt)),sales:await db.select().from(sales).orderBy(desc(sales.date),desc(sales.createdAt)),sync:{configured:await bridgeReady(),...(await db.select().from(syncState))[0]}});}catch{return json({error:'База временно недоступна'},503);}
}
export async function POST(req:Request){
 const user=await getCRMUser();if(!user)return json({error:'Нужно войти'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Недопустимый источник'},403);
 try{
 const raw=await req.json();if(!raw||typeof raw!=='object'||Array.isArray(raw))return json({error:'Некорректный запрос'},400);
 const b=raw as Record<string,unknown>,db=getDb(),now=new Date().toISOString(),id=text(b.id,100),eventId=text(b.eventId,100);
 if(b.action==='pull'){
  try{
   const {leads}=await sheetCall('list');if(!Array.isArray(leads)||leads.length>10000)throw Error('Некорректный ответ таблицы');
   const seen=new Set<string>();for(const l of leads){if(!l.id||seen.has(l.id)||!l.name)throw Error('У заявки отсутствует ID/имя либо ID повторяется');seen.add(l.id);}
   for(const l of leads){
    const old=(await db.select().from(clients).where(eq(clients.externalId,l.id)))[0];const snapshot=JSON.stringify(fields(l));
    if(old){if(!old.pending&& (snapshot!==old.remoteSnapshot||old.name!==l.name||old.contact!==l.contact||old.request!==l.request))await db.update(clients).set({name:l.name,contact:l.contact,request:l.request,...fields(l),remoteSnapshot:snapshot,version:old.version+1,syncError:''}).where(and(eq(clients.id,old.id),eq(clients.version,old.version),eq(clients.pending,0)));}
    else await db.insert(clients).values({id:crypto.randomUUID(),externalId:l.id,name:l.name,contact:l.contact,source:'Таргет',request:l.request,...fields(l),remoteSnapshot:snapshot,stage:'Новый',nextAction:'',nextDate:'',createdAt:l.createdAt||now,updatedAt:now,version:0}).onConflictDoNothing();
   }
   await db.insert(syncState).values({id:'sheet',lastRead:now,error:''}).onConflictDoUpdate({target:syncState.id,set:{lastRead:now,error:''}});
   return json({ok:true,count:leads.length});
  }catch(e){await db.insert(syncState).values({id:'sheet',lastRead:'',error:(e as Error).message}).onConflictDoUpdate({target:syncState.id,set:{error:(e as Error).message}});return json({error:(e as Error).message},502);}
 }
 if(b.action==='retry'){await push(id);return json({ok:true});}
 if(!/^[a-zA-Z0-9-]{10,100}$/.test(eventId))return json({error:'Некорректный запрос'},400);
 if((await db.select().from(events).where(eq(events.id,eventId))).length){await push(id);return json({ok:true});}
 if(b.action==='create'){
  const name=text(b.name,150),source=text(b.source,40);if(!name||!sources.includes(source as any)||source==='Таргет')return json({error:'Укажите имя и источник'},400);
  await db.batch([db.insert(clients).values({id:eventId,name,contact:text(b.contact,150),source,stage:'Новый',nextAction:text(b.nextAction,500),nextDate:text(b.nextDate,10),createdAt:now,updatedAt:now,version:0,notes:text(b.notes)}),db.insert(events).values({id:eventId,clientId:eventId,type:'created',note:'Клиент добавлен',stage:'Не обработан',amount:0,currency:'',actor:user.email,createdAt:now})]);
 }else{
  const c=(await db.select().from(clients).where(eq(clients.id,id)))[0];if(!c)return json({error:'Клиент не найден'},404);
  if(b.action==='acceptRemote'){
   if(!c.externalId)return json({error:'Клиент не связан с таблицей'},400);
   const result=await sheetCall('list'),lead=result.leads?.find(l=>l.id===c.externalId);if(!lead)return json({error:'Заявка не найдена в таблице'},404);
   await db.batch([db.update(clients).set({...fields(lead),remoteSnapshot:JSON.stringify(fields(lead)),pending:0,syncError:'',version:c.version+1}).where(and(eq(clients.id,id),eq(clients.version,c.version))),db.insert(events).select(sql`SELECT ${eventId},${id},'sync',${'Приняты значения из MOFT.RACE; прежнее изменение осталось в истории'},${lead.status},0,'',${user.email},${now} WHERE changes() = 1`)]);
   if(!(await db.select().from(events).where(eq(events.id,eventId))).length)return json({error:'Карточка изменилась. Обновите данные.'},409);
  }else if(b.action==='pay'){
   const saleId=text(b.saleId,100),sale=(await db.select().from(sales).where(and(eq(sales.id,saleId),eq(sales.clientId,id))))[0],amount=Number(b.amount);
   if(!sale||!Number.isFinite(amount)||amount<=0||amount>1e12||Math.round(amount*100)+sale.paid>sale.amount)return json({error:'Проверьте сумму доплаты'},400);
   if(sale.paid!==Number(b.expectedPaid))return json({error:'Сумма оплаты уже изменилась. Обновите карточку.'},409);
   const minor=Math.round(amount*100);
   await db.batch([db.update(sales).set({paid:sale.paid+minor}).where(and(eq(sales.id,saleId),eq(sales.paid,sale.paid))),db.insert(events).select(sql`SELECT ${eventId},${id},'payment',${'Доплата: '+sale.product},${c.status},${minor},${sale.currency},${user.email},${now} WHERE changes() = 1`)]);
   if(!(await db.select().from(events).where(eq(events.id,eventId))).length)return json({error:'Оплата изменилась. Обновите данные.'},409);
  }else if(b.action==='sale'){
   const amount=Number(b.amount),paid=Number(b.paid||0),quantity=Number(b.quantity),currency=text(b.currency,3),date=text(b.date,10),product=text(b.product,500);
   if(!Number.isFinite(amount)||amount<=0||amount>1e12||!Number.isFinite(paid)||paid<0||paid>amount||!Number.isInteger(quantity)||quantity<1||quantity>1000000||!['UZS','USD','EUR'].includes(currency)||!validDate(date)||!product)return json({error:'Проверьте товар, дату, количество и суммы. Оплата не может превышать сумму продажи.'},400);
   await db.batch([db.insert(sales).values({id:eventId,clientId:id,date,product,quantity,amount:Math.round(amount*100),paid:Math.round(paid*100),currency,note:text(b.note),actor:user.email,createdAt:now}),db.insert(events).values({id:eventId,clientId:id,type:'sale',note:'Продажа: '+product,stage:c.status,amount:Math.round(paid*100),currency,actor:user.email,createdAt:now})]);
  }else if(b.action==='update'){
   if(c.version!==b.version)return json({error:'Карточка изменилась. Обновите данные и откройте её снова.'},409);
   const status=text(b.status,50),saleStatus=text(b.saleStatus,50),notes=text(b.notes),nextAction=text(b.nextAction,500),nextDate=text(b.nextDate,10);
   if((!statuses.includes(status as any)&&status!==c.status)||(!saleStatuses.includes(saleStatus as any)&&saleStatus!==c.saleStatus)||(nextDate&&!validDate(nextDate)))return json({error:'Проверьте статусы и дату'},400);
   const change=status!==c.status||saleStatus!==c.saleStatus||notes!==c.notes;
   const pending=c.externalId&&(change||c.pending)?1:0;
   const note=change?`Статус: ${status}. Продажа: ${saleStatus||'не указана'}. ${notes}`:'Обновлён следующий шаг';
   await db.batch([db.update(clients).set({status,saleStatus,notes,nextAction,nextDate,version:c.version+1,updatedAt:now,pending,syncError:pending?c.syncError:''}).where(and(eq(clients.id,id),eq(clients.version,c.version))),db.insert(events).select(sql`SELECT ${eventId},${id},'contact',${note},${status},0,'',${user.email},${now} WHERE changes() = 1`)]);
   if(!(await db.select().from(events).where(eq(events.id,eventId))).length)return json({error:'Карточка изменилась. Обновите данные.'},409);
   if(pending)await push(id);
  }else return json({error:'Неизвестное действие'},400);
 }
 return json({ok:true});
 }catch{return json({error:'Не удалось сохранить. Повторите запрос; повторная отправка не создаёт второй записи.'},500);}
}


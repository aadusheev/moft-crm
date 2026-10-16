export const statuses=['Не обработан','В обработке','Не дозвонились','Подходит (квал)','Не подходит'] as const;
export const saleStatuses=['','-','В работе','Успешная сделка'] as const;
export const stages=['Новый','В работе','КП отправлено','Заказ подтверждён','Завершён','Отказ'] as const;
export const sources=['Свой поиск','Рекомендация','Входящий','Таргет'] as const;
export function dateKey(d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
export function dayOffset(days:number){return dateKey(new Date(Date.now()+days*86400000));}
export type Client={id:string,name:string,contact:string,source:string,externalId:string|null,stage:string,nextAction:string,nextDate:string,createdAt:string,updatedAt:string,version:number,status:string,saleStatus:string,notes:string,request:string,remoteSnapshot:string,pending:number,syncError:string};
export type Event={id:string,clientId:string,type:string,note:string,stage:string,amount:number,currency:string,actor:string,createdAt:string};
export type Sale={id:string,clientId:string,date:string,product:string,quantity:number,amount:number,paid:number,currency:string,note:string,actor:string,createdAt:string};

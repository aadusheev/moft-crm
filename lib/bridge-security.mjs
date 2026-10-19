const encoder = new TextEncoder();
export function validateBridge(url, secret) {
  if (typeof url !== 'string' || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) throw Error('Укажи адрес опубликованного моста Google Apps Script, заканчивающийся на /exec');
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 512) throw Error('Ключ подключения должен содержать от 32 до 512 символов');
}
async function encryptionKey(master) {
  if (typeof master !== 'string' || master.length < 32) throw Error('Администратору сервера нужно настроить CRM_SETTINGS_KEY');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(master)), 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function encryptSecret(secret, master) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:encoder.encode('moft:sheet:v1')}, await encryptionKey(master), encoder.encode(secret));
  return JSON.stringify({v:1,iv:Array.from(iv),data:Array.from(new Uint8Array(data))});
}
export async function decryptSecret(cipher, master) {
  const item=JSON.parse(cipher);
  if(item.v!==1)throw Error('Неизвестная версия ключа');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(item.iv),additionalData:encoder.encode('moft:sheet:v1')},await encryptionKey(master),new Uint8Array(item.data)));
}
export async function callBridge(url, secret, action, payload={}) {
  validateBridge(url,secret);
  const body=JSON.stringify({action,...payload}).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  const timestamp=Date.now().toString();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(timestamp+'.'+body)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  // Google redirects its response to googleusercontent. Never forward the signed POST to a redirect target.
  const signal=AbortSignal.timeout(25000);
  let response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({timestamp,body,signature}),redirect:'manual',signal});
  if([301,302,303].includes(response.status)) {
    const location=new URL(response.headers.get('location')||'',url);
    if(location.protocol!=='https:' || location.hostname!=='script.googleusercontent.com' || location.username || location.password)throw Error('Мост вернул недопустимый адрес ответа');
    response=await fetch(location.toString(),{method:'GET',redirect:'error',signal});
  }
  if(!response.ok)throw Error('Google временно недоступен');
  const data=await response.json();
  if(!data || data.ok!==true)throw Error('Мост отклонил запрос. Проверь ключ и доступ к таблице.');
  return data;
}
export function validateLeads(leads) {
  if(!Array.isArray(leads)||leads.length>10000)throw Error('Некорректный список заявок');
  const seen=new Set();
  for(const lead of leads){
    if(!lead||typeof lead.id!=='string'||!lead.id||seen.has(lead.id)||typeof lead.name!=='string'||!lead.name)throw Error('В заявках отсутствуют ID/имена или повторяются ID');
    for(const key of ['contact','request','createdAt','status','saleStatus','notes'])if(typeof lead[key]!=='string')throw Error('В заявках отсутствуют обязательные поля');
    seen.add(lead.id);
  }
  return leads.length;
}

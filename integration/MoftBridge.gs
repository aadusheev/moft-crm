/** MOFT.RACE bridge. Only F:H (by verified headers) may be written. */
const MOFT_FILE='1toaLdCJaGDqCyylYLrai2bwz4YEaXIr3r37qF5do7PI';
function doGet(){return ContentService.createTextOutput('MOFT bridge: POST required');}
function doPost(e){
 try{
  const envelope=JSON.parse(e.postData.contents),secret=PropertiesService.getScriptProperties().getProperty('MOFT_BRIDGE_SECRET');
  if(!secret||typeof envelope.body!=='string'||Math.abs(Date.now()-Number(envelope.timestamp))>300000)throw Error('Unauthorized');
  const signature=Utilities.computeHmacSha256Signature(String(envelope.timestamp)+'.'+envelope.body,secret).map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');
  if(signature!==envelope.signature)throw Error('Unauthorized');
  const req=JSON.parse(envelope.body),lock=LockService.getScriptLock();lock.waitLock(20000);
  try{return respond(runRequest(req));}finally{lock.releaseLock();}
 }catch(err){return respond({ok:false,error:String(err.message||err)});}
}
function respond(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function runRequest(req){
 const sheet=SpreadsheetApp.openById(MOFT_FILE).getSheetByName('Заявки');
 if(!sheet||sheet.getSheetId()!==0)throw Error('Лист Заявки не найден');
 const values=sheet.getDataRange().getDisplayValues(),header=values[0];
 const col=name=>{const matches=header.map((v,i)=>v===name?i:-1).filter(i=>i>=0);if(matches.length!==1)throw Error('Неоднозначный столбец '+name);return matches[0];};
 const c={id:col('id'),name:col('Имя'),contact:col('Номер телефона'),request:col('Запрос'),date:col('Дата поступления заявки'),status:col('Статус'),saleStatus:col('Статус продажи'),notes:col('Примечания')};
 if(c.status!==5||c.saleStatus!==6||c.notes!==7)throw Error('Структура листа изменилась. Запись остановлена.');
 const props=PropertiesService.getScriptProperties();
 const stableId=r=>{const fingerprint=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(r.slice(0,4))).map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');const key='legacy_'+fingerprint,remembered=props.getProperty(key);if(remembered)return remembered;if(r[c.id])return r[c.id];const id='legacy:'+fingerprint;props.setProperty(key,id);return id;};
 const rows=[],seen={};for(let i=1;i<values.length;i++){const r=values[i];if(!r[c.id]&&!r[c.name])continue;const id=stableId(r);if(seen[id])throw Error('Повтор ID или неразличимые заявки в строке '+(i+1));seen[id]=true;rows.push({row:i+1,data:r,id});}
 const fields=r=>({status:r[c.status]||'',saleStatus:r[c.saleStatus]||'',notes:r[c.notes]||''});
 if(req.action==='list')return {ok:true,leads:rows.map(x=>{const r=x.data;let createdAt='';try{createdAt=Utilities.parseDate(r[c.date],'Asia/Tashkent','dd.MM.yyyy HH:mm:ss').toISOString();}catch(_){}return {id:x.id,name:r[c.name]||r[c.contact]||r[c.id],contact:r[c.contact],request:r[c.request],createdAt,...fields(r)};})};
 if(req.action!=='update')throw Error('Unknown action');
 const row=rows.find(x=>x.id===req.id);if(!row)throw Error('Лид не найден в таблице');
 const target=req.fields,expected=req.expected,keys=['status','saleStatus','notes'];
 if(!target||!expected||Object.keys(target).sort().join(',')!==keys.slice().sort().join(',')||keys.some(k=>typeof target[k]!=='string'||typeof expected[k]!=='string')||target.notes.length>2000)throw Error('Invalid fields');
 const current=fields(row.data),equal=(a,b)=>keys.every(k=>a[k]===b[k]);
 if(equal(current,target))return {ok:true,fields:current};
 if(!equal(current,expected))throw Error('Конфликт: эти поля изменили в MOFT.RACE. Сверьте карточку с таблицей; чужие изменения не перезаписаны.');
 const knownStatus=['Не обработан','В обработке','Не дозвонились','Подходит (квал)','Не подходит'];
 const knownSale=['','-','В работе','Успешная сделка'];
 if(!knownStatus.includes(target.status)&&target.status!==current.status)throw Error('Unknown status');
 if(!knownSale.includes(target.saleStatus)&&target.saleStatus!==current.saleStatus)throw Error('Unknown sale status');
 // Rich text writes literal strings, including leading '='. No formulas or technical fields are written.
 sheet.getRange(row.row,6,1,3).setRichTextValues([keys.map(k=>SpreadsheetApp.newRichTextValue().setText(target[k]).build())]);
 SpreadsheetApp.flush();
 const saved=sheet.getRange(row.row,6,1,3).getDisplayValues()[0];
 if(!keys.every((k,i)=>saved[i]===target[k]))throw Error('Не удалось подтвердить запись');
 return {ok:true,fields:target};
}

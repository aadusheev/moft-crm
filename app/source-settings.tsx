'use client';
import {useEffect,useState} from 'react';
type State={bridgeUrl:string,hasSecret:boolean,enabled:boolean,canSave:boolean,revision:number};
export default function SourceSettings({close,changed,importLeads}:{close:()=>void,changed:()=>Promise<void>,importLeads:()=>Promise<void>}){
 const [state,setState]=useState<State|null>(null),[url,setUrl]=useState(''),[secret,setSecret]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/source-settings',{cache:'no-store'});const j=await r.json() as State & {error?:string};if(!r.ok)throw Error(j.error||'Не удалось прочитать настройки');setState(j);setUrl(j.bridgeUrl);}
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 async function run(action:string){setBusy(true);setError('');setNotice('');try{
  const r=await fetch('/api/source-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,bridgeUrl:url,secret,revision:state?.revision})});
  const j=await r.json() as {error?:string,count?:number};if(!r.ok)throw Error(j.error||'Не удалось выполнить действие');
  setNotice(action==='disable'?'Обмен приостановлен. Клиенты сохранены.':action==='test'?`Связь работает. В источнике ${j.count} лидов. Проверка не меняет данные.`:`Подключение сохранено. В источнике ${j.count} лидов.`);
  if(action!=='test'){setSecret('');await load();await changed();}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function importNow(){setBusy(true);setError('');setNotice('');try{await importLeads();setNotice('Лиды обновлены. Актуальные статусы доступны на канбане.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="overlay"><section className="drawer" role="dialog" aria-modal="true" aria-label="Подключение Google-таблицы"><div className="drawer-title"><div><small>Настройки · Источник лидов</small><h2>Google-таблица</h2></div><button className="secondary" disabled={busy} onClick={close}>Закрыть</button></div>
 <p>MOFT.RACE передаёт заявки в CRM через опубликованный мост Google Apps Script. Обычная ссылка на таблицу не заменяет адрес моста.</p>
 {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}
 {state&&<><p className="pill">{state.enabled?'Обмен включён':'Обмен не включён'}</p>
 {!state.canSave&&<div className="warning">Нужно один раз настроить защищённое хранение на сервере: CRM_SETTINGS_KEY. После этого подключение можно менять здесь.</div>}
 <form onSubmit={e=>{e.preventDefault();run('save');}}><label>Адрес моста Google Apps Script<input type="url" value={url} required maxLength={500} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off"/></label>
 <label>Ключ подключения<input type="password" value={secret} maxLength={512} onChange={e=>setSecret(e.target.value)} placeholder={state.hasSecret?'Ключ сохранён. Оставь пустым, чтобы сохранить его.':'Ключ из настроек моста'} autoComplete="new-password"/></label>
 <p className="muted">Сохранённый ключ не показывается. Проверка только читает источник. Перед сохранением CRM повторно проверит связь.</p>
 <div className="source-actions"><button type="button" className="secondary" disabled={busy||!url} onClick={()=>run('test')}>Проверить связь</button><button className="primary" disabled={busy||!state.canSave}>{busy?'Подожди…':'Сохранить подключение'}</button></div></form>
 <hr/><h3>Обмен данными</h3><p>Из таблицы: новые лиды и текущие статусы. Обратно: только «Статус», «Статус продажи», «Примечания».</p><p className="muted">Обновление при открытии CRM и раз в минуту, пока она открыта. Собственные клиенты и продажи остаются в CRM.</p>
 <div className="source-actions"><button className="primary" disabled={busy||!state.enabled} onClick={importNow}>Загрузить / обновить лиды</button><button className="secondary" disabled={busy||!state.enabled} onClick={()=>run('disable')}>Приостановить обмен</button></div></>}
 </section></div>;
}


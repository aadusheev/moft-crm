'use client';
import {useEffect,useState} from 'react';
export default function Login(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const p=new URLSearchParams(window.location.hash.slice(1));setCode(p.get('code')||'');setEmail(p.get('email')||'');if(window.location.hash)history.replaceState(null,'','/login');},[]);
 async function submit(e:React.FormEvent){e.preventDefault();setError('');if(code&&password!==confirm){setError('Пароли не совпадают');return;}setBusy(true);try{
  const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:code?'setup':'login',email,password,code})});
  const j=await r.json() as {error?:string};if(!r.ok)throw Error(j.error||'Не удалось войти');window.location.replace('/');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="auth-page"><section className="auth-card"><div className="auth-brand">MOFT · CRM</div><h1>{code?'Создать пароль':'Войти'}</h1><p>{code?'Задай свой пароль. Ссылка действует один раз.':'Вход для владельца и сотрудников'}</p>{error&&<div className="error" role="alert">{error}</div>}<form onSubmit={submit}><label>Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Пароль<input type="password" required minLength={12} maxLength={128} autoComplete={code?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{code&&<label>Повтори пароль<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}<button className="primary" disabled={busy}>{busy?'Подожди…':code?'Сохранить пароль и войти':'Войти'}</button></form><small>{code?'Минимум 12 символов.':'Первый вход — по приглашению владельца. Если забыл пароль, обратись к владельцу или администратору сервера.'}</small></section></main>;
}

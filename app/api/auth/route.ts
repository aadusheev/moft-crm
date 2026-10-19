import {auth} from '@/lib/crm-auth';
import {normalizeEmail,validPassword,readToken,sessionCookie} from '@/lib/auth-core.mjs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200,cookie?:string)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
export async function GET(req:Request){
 try{const user=await auth().user(readToken(req.headers.get('cookie')));return user?json({user}):json({error:'Нужно войти'},401);}catch{return json({error:'Вход временно недоступен'},503);}
}
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return json({error:'Недопустимый источник'},403);
 if(Number(req.headers.get('content-length')||0)>4096)return json({error:'Слишком большой запрос'},413);
 try{
  const raw=await req.text();if(raw.length>4096)return json({error:'Слишком большой запрос'},413);
  const b=JSON.parse(raw),service=auth(),existing=readToken(req.headers.get('cookie'));
  if(b.action==='logout'){await service.logout(existing);return json({ok:true},200,sessionCookie('',0));}
  const email=normalizeEmail(b.email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:'Укажи корректный email'},400);
  if(b.action==='invite'){
   const user=await service.user(existing);if(!user)return json({error:'Нужно войти'},401);if(user.role!=='owner')return json({error:'Только владелец'},403);
   const code=await service.invite(email);return code?json({code,email}):json({error:'Этот сотрудник уже зарегистрирован'},409);
  }
  if(!['login','setup'].includes(b.action))return json({error:'Неизвестное действие'},400);
  if(!validPassword(b.password))return json({error:'Пароль должен содержать от 12 до 128 символов'},400);
  if(!await service.limit(email))return json({error:'Слишком много попыток. Повтори через 15 минут.'},429);
  const session=b.action==='login'?await service.login(email,b.password):await service.setup(email,b.password,typeof b.code==='string'?b.code:'');
  if(!session)return json({error:b.action==='login'?'Неверный email или пароль':'Ссылка недействительна, истекла или уже использована'},401);
  await service.logout(existing);return json({ok:true},200,sessionCookie(session));
 }catch{return json({error:'Не удалось выполнить вход. Повтори позже.'},503);}
}

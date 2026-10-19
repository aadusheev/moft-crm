import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {authService,readToken} from './auth-core.mjs';
import bootstrap from './owner-bootstrap.json';
export type CRMUser={email:string,role:'owner'|'staff'};
export function auth(){return authService(env.DB,bootstrap);}
export async function getCRMUser():Promise<CRMUser|null>{
 const h=await headers();return auth().user(readToken(h.get('cookie')));
}

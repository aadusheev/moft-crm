import {getCRMUser} from '@/lib/crm-auth';
import {redirect} from 'next/navigation';
import CRM from './ui';
import AccountControls from './account-controls';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getCRMUser();if(!user)redirect('/login');return <><AccountControls email={user.email} owner={user.role==='owner'}/><CRM/></>;}

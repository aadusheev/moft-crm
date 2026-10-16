import {requireChatGPTUser} from './chatgpt-auth';
import CRM from './ui';
export const dynamic='force-dynamic';
export default async function Home(){await requireChatGPTUser('/');return <CRM/>;}
